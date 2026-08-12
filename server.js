import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import axios from 'axios';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================================================
   STATIC FILES
========================================================= */

app.use(express.static(__dirname));

/* =========================================================
   CORS
========================================================= */

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, OPTIONS'
    );
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization'
    );

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    next();
});

/* =========================================================
   SERVER + SOCKET.IO
========================================================= */

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*'
    },
    allowEIO3: true
});

/* =========================================================
   MONGODB
========================================================= */

const dbUrl =
    process.env.MONGODB_URI ||
    'mongodb://localhost:27017/live-modarraj';

mongoose
    .connect(dbUrl, {
        serverSelectionTimeoutMS: 5000
    })
    .then(() => {
        console.log('✅ قاعدة البيانات متصلة بنجاح');
    })
    .catch((err) => {
        console.log(
            '⚠️ تعذر الاتصال بقاعدة البيانات - سيعمل السيرفر بدون MongoDB'
        );
        console.log('تفاصيل الخطأ:', err.message);
    });

/* =========================================================
   CACHE
========================================================= */

const localMemoryCache = {};

const CACHE_DURATION = 60 * 1000;

/* =========================================================
   DATE
   TheSportsDB expects YYYY-MM-DD
========================================================= */

const formatDateForTheSportsDB = (dateString) => {
    return dateString;
};

/* =========================================================
   LEAGUES
========================================================= */

const LEAGUES = [
    {
        name: 'Saudi Professional League',
        priority: 100
    },
    {
        name: 'UEFA Champions League',
        priority: 100
    },
    {
        name: 'English Premier League',
        priority: 95
    },
    {
        name: 'La Liga',
        priority: 90
    },
    {
        name: 'Serie A',
        priority: 90
    },
    {
        name: 'Bundesliga',
        priority: 90
    },
    {
        name: 'Ligue 1',
        priority: 85
    },
    {
        name: 'Egyptian Premier League',
        priority: 80
    }
];

/* =========================================================
   IMPORTANT TEAMS
========================================================= */

const PRIORITY_TEAMS = [
    'Al Hilal',
    'Al Nassr',
    'Al Ittihad',
    'Al Ahli',
    'الهلال',
    'النصر',
    'الاتحاد',
    'الأهلي'
];

/* =========================================================
   MATCH PRIORITY
========================================================= */

const getMatchPriority = (event) => {

    let score = Number(event._leaguePriority || 50);

    const home = String(
        event.strHomeTeam || ''
    ).toLowerCase();

    const away = String(
        event.strAwayTeam || ''
    ).toLowerCase();

    /* أهمية الأندية السعودية */

    for (const team of PRIORITY_TEAMS) {

        const teamName = team.toLowerCase();

        if (home.includes(teamName)) {
            score += 15;
        }

        if (away.includes(teamName)) {
            score += 15;
        }
    }

    /* المباريات المباشرة لها أعلى أولوية */

    const status = String(
        event.strStatus || ''
    ).toUpperCase();

    if (
        [
            '1H',
            '2H',
            'ET',
            'P',
            'LIVE'
        ].includes(status)
    ) {
        score += 1000;
    }

    /* مباريات النهائي */

    if (
        [
            'FT',
            'AET',
            'PEN'
        ].includes(status)
    ) {
        score += 5;
    }

    return score;
};

/* =========================================================
   STATUS
========================================================= */

const normalizeStatus = (status) => {

    const value = String(
        status || ''
    ).toUpperCase();

    if (
        [
            '1H',
            '2H',
            'ET',
            'P',
            'LIVE'
        ].includes(value)
    ) {
        return 'LIVE';
    }

    if (value === 'HT') {
        return 'HT';
    }

    if (
        [
            'FT',
            'AET',
            'PEN',
            'FINAL'
        ].includes(value)
    ) {
        return 'FT';
    }

    if (
        [
            'NS',
            'TBD',
            'NOT STARTED'
        ].includes(value)
    ) {
        return 'NS';
    }

    return 'NS';
};

/* =========================================================
   GET MATCHES
========================================================= */

app.get('/api/matches', async (req, res) => {

    const requestedDate =
        req.query.date ||
        new Date().toISOString().split('T')[0];

    const cacheKey =
        `sports_db_matches_${requestedDate}`;

    try {

        /* ---------------------------------------------
           CHECK CACHE
        --------------------------------------------- */

        if (
            localMemoryCache[cacheKey] &&
            Date.now() <
                localMemoryCache[cacheKey].expireAt
        ) {

            console.log(
                `✅ البيانات من الكاش: ${requestedDate}`
            );

            return res.json({
                source: 'Local Memory Cache',
                data: localMemoryCache[cacheKey].data,
                cached: true,
                count:
                    localMemoryCache[cacheKey].data.length,
                date: requestedDate
            });
        }

        /* ---------------------------------------------
           API KEY
        --------------------------------------------- */

        const apiKey =
            process.env.THESPORTSDB_API_KEY;

        if (!apiKey) {

            console.error(
                '❌ THESPORTSDB_API_KEY غير موجود'
            );

            return res.status(500).json({
                source: 'Configuration Error',
                data: [],
                count: 0,
                error:
                    'THESPORTSDB_API_KEY is missing on the server'
            });
        }

        /* ---------------------------------------------
           DATE
        --------------------------------------------- */

        const formattedDate =
            formatDateForTheSportsDB(
                requestedDate
            );

        console.log('');
        console.log(
            '📡 جلب المباريات من TheSportsDB'
        );
        console.log(
            `📅 التاريخ: ${formattedDate}`
        );
        console.log(
            '🔐 API Key: موجود في Environment Variables'
        );

        let allEvents = [];

        /* ---------------------------------------------
           GET LEAGUES
        --------------------------------------------- */

        for (const league of LEAGUES) {

            try {

                console.log(
                    `🔎 ${league.name}`
                );

                const url =
                    `https://www.thesportsdb.com/api/v1/json/${apiKey}` +
                    `/eventsday.php` +
                    `?d=${encodeURIComponent(formattedDate)}` +
                    `&l=${encodeURIComponent(league.name)}`;

                const response =
                    await axios.get(url, {
                        timeout: 12000,
                        headers: {
                            'User-Agent':
                                'Live-Modarraj/1.0'
                        }
                    });

                const results =
                    response.data?.events ||
                    response.data?.results ||
                    [];

                const events =
                    Array.isArray(results)
                        ? results
                        : [];

                const validEvents =
                    events
                        .filter(
                            (event) =>
                                event &&
                                event.strHomeTeam &&
                                event.strAwayTeam
                        )
                        .map((event) => ({
                            ...event,
                            _leaguePriority:
                                league.priority
                        }));

                console.log(
                    `   ✅ ${validEvents.length} مباراة`
                );

                allEvents.push(
                    ...validEvents
                );

            } catch (error) {

                console.log(
                    `   ⚠️ تعذر جلب ${league.name}`
                );

                if (error.response) {

                    console.log(
                        `   HTTP: ${error.response.status}`
                    );
                } else {

                    console.log(
                        `   ${error.message}`
                    );
                }

                /* لا نوقف بقية الدوريات */

                continue;
            }
        }

        /* ---------------------------------------------
           REMOVE DUPLICATES
        --------------------------------------------- */

        const uniqueEvents =
            Array.from(
                new Map(
                    allEvents.map(
                        (event) => [
                            event.idEvent ||
                            `${event.strHomeTeam}-${event.strAwayTeam}-${event.dateEvent}-${event.strTime}`,
                            event
                        ]
                    )
                ).values()
            );

        console.log(
            `📊 إجمالي المباريات: ${uniqueEvents.length}`
        );

        /* ---------------------------------------------
           NO DEMO DATA
        --------------------------------------------- */

        if (uniqueEvents.length === 0) {

            console.log(
                `ℹ️ لا توجد مباريات حقيقية في ${requestedDate}`
            );
        }

        /* ---------------------------------------------
           NORMALIZE MATCHES
        --------------------------------------------- */

        const standardMatches =
            uniqueEvents
                .map((event, index) => {

                    const homeScore =
                        Number.isFinite(
                            Number(
                                event.intHomeScore
                            )
                        )
                            ? Number(
                                event.intHomeScore
                            )
                            : 0;

                    const awayScore =
                        Number.isFinite(
                            Number(
                                event.intAwayScore
                            )
                        )
                            ? Number(
                                event.intAwayScore
                            )
                            : 0;

                    const status =
                        normalizeStatus(
                            event.strStatus
                        );

                    const priority =
                        getMatchPriority(
                            event
                        );

                    let matchDate;

                    if (event.dateEvent) {

                        matchDate =
                            `${event.dateEvent}T` +
                            `${event.strTime || '00:00:00'}`;

                    } else {

                        matchDate =
                            new Date().toISOString();
                    }

                    return {

                        fixture: {

                            id:
                                event.idEvent ||
                                `match-${index}`,

                            date:
                                matchDate,

                            status: {

                                short:
                                    status,

                                elapsed:
                                    event.strProgress ||
                                    event.intProgress ||
                                    ''
                            }
                        },

                        league: {

                            id:
                                event.idLeague ||
                                '',

                            name:
                                event.strLeague ||
                                'بطولات كبرى',

                            country:
                                event.strCountry ||
                                ''
                        },

                        teams: {

                            home: {

                                name:
                                    event.strHomeTeam ||
                                    'فريق غير معروف',

                                logo:
                                    event.strHomeTeamBadge ||
                                    'https://www.thesportsdb.com/images/media/team/badge/default.png'
                            },

                            away: {

                                name:
                                    event.strAwayTeam ||
                                    'فريق غير معروف',

                                logo:
                                    event.strAwayTeamBadge ||
                                    'https://www.thesportsdb.com/images/media/team/badge/default.png'
                            }
                        },

                        goals: {

                            home:
                                homeScore,

                            away:
                                awayScore
                        },

                        media: {

                            channel:
                                event.strTVStation ||
                                '',

                            commentator:
                                event.strCommentator ||
                                ''
                        },

                        priority
                    };
                });

        /* ---------------------------------------------
           SORT FOR VISITOR
        --------------------------------------------- */

        standardMatches.sort(
            (a, b) => {

                /* LIVE FIRST */

                const liveA =
                    a.fixture.status.short ===
                    'LIVE'
                        ? 1
                        : 0;

                const liveB =
                    b.fixture.status.short ===
                    'LIVE'
                        ? 1
                        : 0;

                if (liveA !== liveB) {

                    return liveB - liveA;
                }

                /* IMPORTANT MATCHES */

                if (
                    (b.priority || 0) !==
                    (a.priority || 0)
                ) {

                    return (
                        (b.priority || 0) -
                        (a.priority || 0)
                    );
                }

                /* TIME */

                return (
                    new Date(a.fixture.date) -
                    new Date(b.fixture.date)
                );
            }
        );

        /* ---------------------------------------------
           CACHE
        --------------------------------------------- */

        localMemoryCache[cacheKey] = {

            data:
                standardMatches,

            expireAt:
                Date.now() +
                CACHE_DURATION
        };

        /* ---------------------------------------------
           SOCKET UPDATE
        --------------------------------------------- */

        io.emit(
            'matchUpdate',
            {
                date:
                    requestedDate,

                matches:
                    standardMatches
            }
        );

        /* ---------------------------------------------
           RESPONSE
        --------------------------------------------- */

        return res.json({

            source:
                'TheSportsDB API',

            data:
                standardMatches,

            count:
                standardMatches.length,

            date:
                requestedDate,

            timestamp:
                new Date().toISOString(),

            cached:
                false
        });

    } catch (error) {

        console.error(
            '❌ خطأ عام:',
            error.message
        );

        return res.status(500).json({

            source:
                'Error',

            data: [],

            count: 0,

            error:
                error.message,

            timestamp:
                new Date().toISOString()
        });
    }
});

/* =========================================================
   HOME
========================================================= */

app.get('/', (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            'live_modarraj_frontend.html'
        )
    );
});

/* =========================================================
   HEALTH
========================================================= */

app.get('/api/health', (req, res) => {

    res.json({

        status:
            'ok',

        message:
            'السيرفر يعمل بشكل طبيعي',

        nodeVersion:
            process.version,

        environment:
            process.env.NODE_ENV ||
            'production',

        apiKey:
            process.env.THESPORTSDB_API_KEY
                ? 'موجود'
                : 'غير موجود',

        timestamp:
            new Date().toISOString()
    });
});

/* =========================================================
   TEST API
========================================================= */

app.get('/api/test', async (req, res) => {

    try {

        const apiKey =
            process.env.THESPORTSDB_API_KEY;

        if (!apiKey) {

            return res.status(500).json({

                status:
                    'error',

                message:
                    'THESPORTSDB_API_KEY غير موجود في Render'
            });
        }

        const testDate =
            new Date()
                .toISOString()
                .split('T')[0];

        const testUrl =
            `https://www.thesportsdb.com/api/v1/json/${apiKey}` +
            `/eventsday.php` +
            `?d=${testDate}` +
            `&l=${encodeURIComponent(
                'English Premier League'
            )}`;

        console.log(
            '🧪 اختبار TheSportsDB'
        );

        const response =
            await axios.get(
                testUrl,
                {
                    timeout: 10000
                }
            );

        const events =
            response.data?.events ||
            response.data?.results ||
            [];

        const count =
            Array.isArray(events)
                ? events.length
                : 0;

        return res.json({

            status:
                'success',

            message:
                'الاتصال بـ TheSportsDB يعمل',

            responseStatus:
                response.status,

            dataCount:
                count,

            testDate,

            timestamp:
                new Date().toISOString()
        });

    } catch (error) {

        return res.status(500).json({

            status:
                'error',

            message:
                'فشل الاتصال بـ TheSportsDB',

            error:
                error.message,

            httpStatus:
                error.response?.status ||
                null,

            timestamp:
                new Date().toISOString()
        });
    }
});

/* =========================================================
   404
========================================================= */

app.use((req, res) => {

    res.status(404).json({

        error:
            'الرابط المطلوب غير موجود',

        path:
            req.path,

        method:
            req.method
    });
});

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
    (err, req, res, next) => {

        console.error(
            '❌ خطأ غير متوقع:',
            err
        );

        res.status(500).json({

            error:
                'حدث خطأ في السيرفر',

            message:
                err.message
        });
    }
);

/* =========================================================
   PORT
========================================================= */

const PORT =
    process.env.PORT ||
    5000;

/* =========================================================
   START SERVER
========================================================= */

server.listen(
    PORT,
    () => {

        console.log('');
        console.log(
            '════════════════════════════════════════════════'
        );

        console.log(
            `🚀 Live Modarraj Server يعمل على المنفذ ${PORT}`
        );

        console.log(
            `📡 API: /api/matches?date=YYYY-MM-DD`
        );

        console.log(
            `💚 Health: /api/health`
        );

        console.log(
            `🧪 Test: /api/test`
        );

        console.log(
            `🔐 TheSportsDB Key: ${
                process.env.THESPORTSDB_API_KEY
                    ? 'موجود'
                    : 'غير موجود'
            }`
        );

        console.log(
            '════════════════════════════════════════════════'
        );

        console.log('');
    }
);

/* =========================================================
   PROCESS ERRORS
========================================================= */

process.on(
    'unhandledRejection',
    (reason) => {

        console.error(
            '❌ Promise Rejection:',
            reason
        );
    }
);

process.on(
    'uncaughtException',
    (error) => {

        console.error(
            '❌ Uncaught Exception:',
            error
        );

        process.exit(1);
    }
);
