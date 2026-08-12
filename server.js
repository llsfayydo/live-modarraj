import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import axios from 'axios';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

/* =========================================================
   BASIC CONFIG
========================================================= */

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
    res.setHeader(
        'Access-Control-Allow-Origin',
        '*'
    );

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
   HTTP SERVER + SOCKET.IO
========================================================= */

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    allowEIO3: true
});

/* =========================================================
   ENVIRONMENT VARIABLES
========================================================= */

const PORT =
    process.env.PORT || 5000;

const THE_SPORTS_DB_API_KEY =
    process.env.THESPORTSDB_API_KEY;

const DATABASE_URL =
    process.env.DATABASE_URL ||
    process.env.MONGODB_URI;

/* =========================================================
   MONGODB
========================================================= */

if (!DATABASE_URL) {

    console.warn(
        '⚠️ DATABASE_URL غير موجود في Render.'
    );

    console.warn(
        '⚠️ سيعمل السيرفر بدون اتصال MongoDB.'
    );

} else {

    mongoose
        .connect(DATABASE_URL, {
            serverSelectionTimeoutMS: 10000
        })
        .then(() => {

            console.log(
                '✅ MongoDB متصل بنجاح'
            );

        })
        .catch((error) => {

            console.error(
                '❌ فشل الاتصال بـ MongoDB:'
            );

            console.error(
                error.message
            );

        });
}

/* =========================================================
   CACHE
========================================================= */

const matchesCache = new Map();

const CACHE_DURATION =
    60 * 1000;

/* =========================================================
   DATE
   TheSportsDB requires YYYY-MM-DD
========================================================= */

function formatDateForTheSportsDB(dateString) {

    return dateString;
}

/* =========================================================
   LEAGUE PRIORITY
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
   TEAM IMPORTANCE
========================================================= */

function getTeamPriority(event) {

    let score = 0;

    const home =
        String(
            event.strHomeTeam || ''
        ).toLowerCase();

    const away =
        String(
            event.strAwayTeam || ''
        ).toLowerCase();

    for (
        const team
        of PRIORITY_TEAMS
    ) {

        const name =
            team.toLowerCase();

        if (
            home.includes(name)
        ) {
            score += 15;
        }

        if (
            away.includes(name)
        ) {
            score += 15;
        }
    }

    return score;
}

/* =========================================================
   MATCH IMPORTANCE
========================================================= */

function getMatchPriority(event) {

    let score =
        Number(
            event._leaguePriority || 50
        );

    score +=
        getTeamPriority(event);

    const status =
        String(
            event.strStatus || ''
        ).toUpperCase();

    /*
       LIVE = أعلى أولوية
    */

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

    /*
       Half Time
    */

    if (
        status === 'HT'
    ) {

        score += 900;
    }

    /*
       Final
    */

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
}

/* =========================================================
   STATUS NORMALIZATION
========================================================= */

function normalizeStatus(status) {

    const value =
        String(
            status || ''
        ).trim().toUpperCase();

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

    if (
        value === 'HT'
    ) {

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
}

/* =========================================================
   VALIDATE DATE
========================================================= */

function isValidDate(dateString) {

    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
            dateString
        )
    ) {

        return false;
    }

    const date =
        new Date(
            `${dateString}T00:00:00Z`
        );

    return (
        !Number.isNaN(
            date.getTime()
        )
    );
}

/* =========================================================
   API KEY CHECK
========================================================= */

function checkSportsDbKey(res) {

    if (
        !THE_SPORTS_DB_API_KEY
    ) {

        console.error(
            '❌ THESPORTSDB_API_KEY غير موجود في Render.'
        );

        res.status(500).json({

            source:
                'Configuration Error',

            data: [],

            count: 0,

            error:
                'THESPORTSDB_API_KEY is missing on the server'

        });

        return false;
    }

    return true;
}

/* =========================================================
   GET MATCHES
========================================================= */

app.get(
    '/api/matches',
    async (req, res) => {

        const requestedDate =
            req.query.date ||
            new Date()
                .toISOString()
                .split('T')[0];

        /* ---------------------------------------------
           DATE VALIDATION
        --------------------------------------------- */

        if (
            !isValidDate(
                requestedDate
            )
        ) {

            return res.status(400).json({

                source:
                    'Validation Error',

                data: [],

                count: 0,

                error:
                    'التاريخ يجب أن يكون بصيغة YYYY-MM-DD'

            });
        }

        /* ---------------------------------------------
           CACHE
        --------------------------------------------- */

        const cacheKey =
            `matches_${requestedDate}`;

        const cached =
            matchesCache.get(
                cacheKey
            );

        if (
            cached &&
            Date.now() <
                cached.expiresAt
        ) {

            console.log(
                `⚡ Cache: ${requestedDate}`
            );

            return res.json({

                source:
                    'Local Cache',

                data:
                    cached.data,

                count:
                    cached.data.length,

                date:
                    requestedDate,

                cached:
                    true,

                timestamp:
                    new Date().toISOString()

            });
        }

        /* ---------------------------------------------
           API KEY
        --------------------------------------------- */

        if (
            !checkSportsDbKey(res)
        ) {
            return;
        }

        const formattedDate =
            formatDateForTheSportsDB(
                requestedDate
            );

        console.log('');
        console.log(
            '════════════════════════════════════'
        );

        console.log(
            '📡 TheSportsDB'
        );

        console.log(
            `📅 ${formattedDate}`
        );

        console.log(
            '🔐 API Key: موجود من Render'
        );

        console.log(
            '════════════════════════════════════'
        );

        let allEvents = [];

        /* ---------------------------------------------
           FETCH LEAGUES
        --------------------------------------------- */

        for (
            const league
            of LEAGUES
        ) {

            try {

                const url =
                    `https://www.thesportsdb.com/api/v1/json/` +
                    `${THE_SPORTS_DB_API_KEY}` +
                    `/eventsday.php` +
                    `?d=${encodeURIComponent(
                        formattedDate
                    )}` +
                    `&l=${encodeURIComponent(
                        league.name
                    )}`;

                console.log(
                    `🔎 ${league.name}`
                );

                const response =
                    await axios.get(
                        url,
                        {
                            timeout:
                                15000,

                            headers: {
                                'User-Agent':
                                    'Live-Modarraj/1.0'
                            }
                        }
                    );

                const events =
                    response.data?.events ||
                    response.data?.results ||
                    [];

                const validEvents =
                    Array.isArray(events)
                        ? events
                            .filter(
                                event =>
                                    event &&
                                    event.strHomeTeam &&
                                    event.strAwayTeam
                            )
                            .map(
                                event => ({
                                    ...event,

                                    _leaguePriority:
                                        league.priority
                                })
                            )
                        : [];

                console.log(
                    `   ✅ ${validEvents.length} مباراة`
                );

                allEvents.push(
                    ...validEvents
                );

            } catch (error) {

                console.error(
                    `   ⚠️ خطأ في ${league.name}`
                );

                if (
                    error.response
                ) {

                    console.error(
                        `   HTTP ${error.response.status}`
                    );

                } else {

                    console.error(
                        `   ${error.message}`
                    );
                }

                /*
                   لا نوقف بقية الدوريات
                */

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
                        event => [

                            event.idEvent ||
                            `${event.strHomeTeam}-` +
                            `${event.strAwayTeam}-` +
                            `${event.dateEvent}-` +
                            `${event.strTime}`,

                            event

                        ]
                    )

                ).values()

            );

        console.log(
            `📊 إجمالي المباريات: ${uniqueEvents.length}`
        );

        /* ---------------------------------------------
           NORMALIZE MATCHES
        --------------------------------------------- */

        const standardMatches =
            uniqueEvents.map(
                (event, index) => {

                    const status =
                        normalizeStatus(
                            event.strStatus
                        );

                    const priority =
                        getMatchPriority(
                            event
                        );

                    let homeScore =
                        event.intHomeScore;

                    let awayScore =
                        event.intAwayScore;

                    if (
                        homeScore === null ||
                        homeScore === undefined ||
                        homeScore === ''
                    ) {

                        homeScore = 0;
                    }

                    if (
                        awayScore === null ||
                        awayScore === undefined ||
                        awayScore === ''
                    ) {

                        awayScore = 0;
                    }

                    /*
                       Match date
                    */

                    let matchDate;

                    if (
                        event.dateEvent
                    ) {

                        matchDate =
                            `${event.dateEvent}T` +
                            `${event.strTime || '00:00:00'}`;

                    } else {

                        matchDate =
                            new Date()
                                .toISOString();
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
                                'بطولة',

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
                                    ''

                            },

                            away: {

                                name:
                                    event.strAwayTeam ||
                                    'فريق غير معروف',

                                logo:
                                    event.strAwayTeamBadge ||
                                    ''

                            }

                        },

                        goals: {

                            home:
                                Number(
                                    homeScore
                                ) || 0,

                            away:
                                Number(
                                    awayScore
                                ) || 0

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
                }
            );

        /* ---------------------------------------------
           SORT BY VISITOR IMPORTANCE
        --------------------------------------------- */

        standardMatches.sort(
            (a, b) => {

                /*
                   1. LIVE
                */

                const liveA =
                    [
                        'LIVE',
                        'HT'
                    ].includes(
                        a.fixture.status.short
                    )
                        ? 1
                        : 0;

                const liveB =
                    [
                        'LIVE',
                        'HT'
                    ].includes(
                        b.fixture.status.short
                    )
                        ? 1
                        : 0;

                if (
                    liveA !== liveB
                ) {

                    return (
                        liveB -
                        liveA
                    );
                }

                /*
                   2. IMPORTANCE
                */

                if (
                    a.priority !==
                    b.priority
                ) {

                    return (
                        b.priority -
                        a.priority
                    );
                }

                /*
                   3. KICKOFF TIME
                */

                return (
                    new Date(
                        a.fixture.date
                    ) -
                    new Date(
                        b.fixture.date
                    )
                );
            }
        );

        /* ---------------------------------------------
           SAVE CACHE
        --------------------------------------------- */

        matchesCache.set(
            cacheKey,
            {

                data:
                    standardMatches,

                expiresAt:
                    Date.now() +
                    CACHE_DURATION

            }
        );

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

            cached:
                false,

            timestamp:
                new Date().toISOString()

        });
    }
);

/* =========================================================
   HEALTH
========================================================= */

app.get(
    '/api/health',
    (req, res) => {

        res.json({

            status:
                'ok',

            server:
                'Live Modarraj',

            apiKey:
                THE_SPORTS_DB_API_KEY
                    ? 'موجود'
                    : 'غير موجود',

            database:
                DATABASE_URL
                    ? 'موجود'
                    : 'غير موجود',

            mongodbState:
                mongoose.connection.readyState,

            environment:
                process.env.NODE_ENV ||
                'production',

            timestamp:
                new Date().toISOString()

        });
    }
);

/* =========================================================
   TEST THESPORTSDB
========================================================= */

app.get(
    '/api/test',
    async (req, res) => {

        if (
            !checkSportsDbKey(res)
        ) {
            return;
        }

        try {

            const testDate =
                new Date()
                    .toISOString()
                    .split('T')[0];

            const url =
                `https://www.thesportsdb.com/api/v1/json/` +
                `${THE_SPORTS_DB_API_KEY}` +
                `/eventsday.php` +
                `?d=${testDate}` +
                `&l=${encodeURIComponent(
                    'English Premier League'
                )}`;

            console.log(
                '🧪 اختبار TheSportsDB...'
            );

            const response =
                await axios.get(
                    url,
                    {
                        timeout:
                            15000
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

                httpStatus:
                    response.status,

                testDate,

                matchesFound:
                    count,

                timestamp:
                    new Date().toISOString()

            });

        } catch (error) {

            console.error(
                '❌ اختبار TheSportsDB فشل:',
                error.message
            );

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
    }
);

/* =========================================================
   SOCKET.IO
========================================================= */

io.on(
    'connection',
    (socket) => {

        console.log(
            `🔌 مستخدم متصل: ${socket.id}`
        );

        socket.on(
            'disconnect',
            () => {

                console.log(
                    `🔌 مستخدم خرج: ${socket.id}`
                );
            }
        );
    }
);

/* =========================================================
   HOME PAGE
========================================================= */

app.get(
    '/',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'live_modarraj_frontend.html'
            )
        );
    }
);

/* =========================================================
   404
========================================================= */

app.use(
    (req, res) => {

        res.status(404).json({

            error:
                'الرابط المطلوب غير موجود',

            path:
                req.path,

            method:
                req.method

        });
    }
);

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
    (err, req, res, next) => {

        console.error(
            '❌ Server Error:',
            err
        );

        res.status(500).json({

            error:
                'حدث خطأ داخلي في السيرفر',

            message:
                err.message

        });
    }
);

/* =========================================================
   START
========================================================= */

server.listen(
    PORT,
    () => {

        console.log('');
        console.log(
            '════════════════════════════════════════'
        );

        console.log(
            '🚀 Live Modarraj Server'
        );

        console.log(
            `🌐 PORT: ${PORT}`
        );

        console.log(
            '📡 /api/matches?date=YYYY-MM-DD'
        );

        console.log(
            '💚 /api/health'
        );

        console.log(
            '🧪 /api/test'
        );

        console.log(
            `🔐 TheSportsDB: ${
                THE_SPORTS_DB_API_KEY
                    ? 'متصل بالمفتاح الموجود في Render'
                    : '❌ المفتاح غير موجود'
            }`
        );

        console.log(
            `🗄️ MongoDB: ${
                DATABASE_URL
                    ? 'DATABASE_URL موجود'
                    : '❌ غير موجود'
            }`
        );

        console.log(
            '════════════════════════════════════════'
        );

        console.log('');
    }
);

/* =========================================================
   PROCESS ERROR HANDLING
========================================================= */

process.on(
    'unhandledRejection',
    (reason) => {

        console.error(
            '❌ Unhandled Rejection:',
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
