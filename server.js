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
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    allowEIO3: true
});

app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        'GET,POST,OPTIONS'
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
   ENVIRONMENT
========================================================= */

const PORT =
    process.env.PORT || 5000;

const API_KEY =
    process.env.THESPORTSDB_API_KEY;

const DATABASE_URL =
    process.env.DATABASE_URL ||
    process.env.MONGODB_URI;

/* =========================================================
   MONGODB
========================================================= */

if (DATABASE_URL) {

    mongoose
        .connect(DATABASE_URL, {
            serverSelectionTimeoutMS: 10000
        })
        .then(() => {
            console.log('✅ MongoDB متصل بنجاح');
        })
        .catch((error) => {
            console.error(
                '⚠️ تعذر الاتصال بـ MongoDB:',
                error.message
            );
        });

} else {

    console.log(
        '⚠️ DATABASE_URL غير موجود - سيعمل السيرفر بدون MongoDB'
    );
}

/* =========================================================
   CACHE
========================================================= */

const cache = new Map();

const CACHE_TIME =
    60 * 1000;

/* =========================================================
   DEFAULT LOGO
========================================================= */

const DEFAULT_LOGO =
    'https://www.thesportsdb.com/images/media/team/badge/default.png';

/* =========================================================
   LEAGUE IMPORTANCE
========================================================= */

const LEAGUE_PRIORITY = {

    'Saudi Professional League': 100,

    'UEFA Champions League': 100,

    'FIFA World Cup': 100,

    'Premier League': 95,

    'English Premier League': 95,

    'La Liga': 90,

    'Serie A': 90,

    'Bundesliga': 90,

    'Ligue 1': 85,

    'Egyptian Premier League': 80,

    'CAF Champions League': 90,

    'AFC Champions League': 90,

    'AFC Champions League Elite': 95,

    'UEFA Europa League': 90,

    'UEFA Europa Conference League': 80,

    'Saudi Kings Cup': 90,

    'King Cup': 90
};

/* =========================================================
   ARABIC LEAGUE NAMES
========================================================= */

const ARABIC_LEAGUES = {

    'Saudi Professional League':
        'الدوري السعودي للمحترفين',

    'Premier League':
        'الدوري الإنجليزي الممتاز',

    'English Premier League':
        'الدوري الإنجليزي الممتاز',

    'La Liga':
        'الدوري الإسباني',

    'Serie A':
        'الدوري الإيطالي',

    'Bundesliga':
        'الدوري الألماني',

    'Ligue 1':
        'الدوري الفرنسي',

    'Egyptian Premier League':
        'الدوري المصري الممتاز',

    'UEFA Champions League':
        'دوري أبطال أوروبا',

    'UEFA Europa League':
        'الدوري الأوروبي',

    'UEFA Europa Conference League':
        'دوري المؤتمر الأوروبي',

    'CAF Champions League':
        'دوري أبطال أفريقيا',

    'AFC Champions League':
        'دوري أبطال آسيا',

    'AFC Champions League Elite':
        'دوري أبطال آسيا للنخبة',

    'FIFA World Cup':
        'كأس العالم',

    'Saudi Kings Cup':
        'كأس خادم الحرمين الشريفين',

    'King Cup':
        'كأس الملك'
};

/* =========================================================
   ARABIC TEAM NAMES
========================================================= */

const ARABIC_TEAMS = {

    'Al Hilal':
        'الهلال',

    'Al-Hilal':
        'الهلال',

    'Al Nassr':
        'النصر',

    'Al-Nassr':
        'النصر',

    'Al Ittihad':
        'الاتحاد',

    'Al-Ittihad':
        'الاتحاد',

    'Al Ahli':
        'الأهلي',

    'Al-Ahli':
        'الأهلي',

    'Al Shabab':
        'الشباب',

    'Al-Shabab':
        'الشباب',

    'Al Ettifaq':
        'الاتفاق',

    'Al-Ettifaq':
        'الاتفاق',

    'Al Fateh':
        'الفتح',

    'Al-Fateh':
        'الفتح',

    'Al Taawoun':
        'التعاون',

    'Al-Taawoun':
        'التعاون',

    'Al Riyadh':
        'الرياض',

    'Al-Riyadh':
        'الرياض',

    'Al Khaleej':
        'الخليج',

    'Al-Khaleej':
        'الخليج',

    'Al Raed':
        'الرائد',

    'Al-Raed':
        'الرائد',

    'Al Wehda':
        'الوحدة',

    'Al-Wehda':
        'الوحدة',

    'Al Okhdood':
        'الأخدود',

    'Al-Okhdood':
        'الأخدود',

    'Al Qadsiah':
        'القادسية',

    'Al-Qadsiah':
        'القادسية',

    'Al Kholood':
        'الخلود',

    'Al-Kholood':
        'الخلود',

    'Neom SC':
        'نيوم',

    'Al Najma':
        'النجمة',

    'Al Najran':
        'نجران',

    'Al Ettifaq':
        'الاتفاق',

    'Al Ahli Saudi':
        'الأهلي',

    'Al Hilal Riyadh':
        'الهلال',

    'Al Nassr Riyadh':
        'النصر',

    'Al Ittihad Jeddah':
        'الاتحاد',

    'Al Ahly':
        'الأهلي',

    'Zamalek':
        'الزمالك',

    'Pyramids FC':
        'بيراميدز',

    'Manchester City':
        'مانشستر سيتي',

    'Manchester United':
        'مانشستر يونايتد',

    'Liverpool':
        'ليفربول',

    'Arsenal':
        'أرسنال',

    'Chelsea':
        'تشيلسي',

    'Tottenham Hotspur':
        'توتنهام',

    'Real Madrid':
        'ريال مدريد',

    'Barcelona':
        'برشلونة',

    'Atletico Madrid':
        'أتلتيكو مدريد',

    'Bayern Munich':
        'بايرن ميونخ',

    'Borussia Dortmund':
        'بوروسيا دورتموند',

    'Paris Saint-Germain':
        'باريس سان جيرمان',

    'PSG':
        'باريس سان جيرمان',

    'Inter Milan':
        'إنتر ميلان',

    'AC Milan':
        'ميلان',

    'Juventus':
        'يوفنتوس',

    'Napoli':
        'نابولي',

    'Roma':
        'روما'
};

/* =========================================================
   TRANSLATION
========================================================= */

function translateTeam(name) {

    if (!name) {
        return 'فريق غير معروف';
    }

    const clean =
        String(name).trim();

    return (
        ARABIC_TEAMS[clean] ||
        clean
    );
}

function translateLeague(name) {

    if (!name) {
        return 'بطولات أخرى';
    }

    const clean =
        String(name).trim();

    return (
        ARABIC_LEAGUES[clean] ||
        clean
    );
}

/* =========================================================
   TEAM PRIORITY
========================================================= */

const IMPORTANT_TEAMS = [

    'Al Hilal',
    'Al-Hilal',
    'Al Nassr',
    'Al-Nassr',
    'Al Ittihad',
    'Al-Ittihad',
    'Al Ahli',
    'Al-Ahli',

    'Real Madrid',
    'Barcelona',

    'Manchester City',
    'Manchester United',
    'Liverpool',
    'Arsenal',
    'Chelsea',

    'Bayern Munich',

    'Paris Saint-Germain',
    'PSG',

    'Juventus',
    'Inter Milan',
    'AC Milan'
];

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
        of IMPORTANT_TEAMS
    ) {

        const t =
            team.toLowerCase();

        if (home.includes(t)) {
            score += 15;
        }

        if (away.includes(t)) {
            score += 15;
        }
    }

    return score;
}

/* =========================================================
   MATCH PRIORITY
========================================================= */

function getMatchPriority(event) {

    const leagueName =
        String(
            event.strLeague || ''
        );

    let score =
        LEAGUE_PRIORITY[
            leagueName
        ] || 40;

    score +=
        getTeamPriority(event);

    const status =
        String(
            event.strStatus || ''
        ).toUpperCase();

    /* مباشر */

    if (
        [
            '1H',
            '2H',
            'LIVE',
            'ET',
            'P'
        ].includes(status)
    ) {

        score += 1000;
    }

    /* استراحة */

    if (
        status === 'HT'
    ) {

        score += 900;
    }

    /* مباراة منتهية */

    if (
        [
            'FT',
            'AET',
            'PEN',
            'FINAL'
        ].includes(status)
    ) {

        score += 5;
    }

    return score;
}

/* =========================================================
   STATUS
========================================================= */

function normalizeStatus(status) {

    const value =
        String(
            status || ''
        )
        .trim()
        .toUpperCase();

    if (
        [
            '1H',
            '2H',
            'LIVE',
            'ET',
            'P'
        ].includes(value)
    ) {

        return 'LIVE';
    }

    if (
        [
            'HT',
            'HALF TIME',
            'HALFTIME'
        ].includes(value)
    ) {

        return 'HT';
    }

    if (
        [
            'FT',
            'FINAL',
            'AET',
            'PEN'
        ].includes(value)
    ) {

        return 'FT';
    }

    return 'NS';
}

/* =========================================================
   DATE VALIDATION
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
   FETCH THE SPORTSDb
========================================================= */

async function fetchFootballMatches(
    requestedDate
) {

    if (!API_KEY) {

        throw new Error(
            'THESPORTSDB_API_KEY غير موجود في Render'
        );
    }

    /*
       مهم جداً:
       لا نحول التاريخ إلى DD.MM.YYYY.
       TheSportsDB يستخدم YYYY-MM-DD.
    */

    const url =
        `https://www.thesportsdb.com/api/v1/json/` +
        `${API_KEY}` +
        `/eventsday.php` +
        `?d=${encodeURIComponent(
            requestedDate
        )}` +
        `&s=Soccer`;

    console.log('');
    console.log(
        '📡 جلب مباريات كرة القدم من TheSportsDB'
    );

    console.log(
        `📅 التاريخ: ${requestedDate}`
    );

    console.log(
        '⚽ الرياضة: Soccer'
    );

    const response =
        await axios.get(
            url,
            {
                timeout: 20000,

                headers: {
                    'User-Agent':
                        'Live-Modarraj/1.0'
                }
            }
        );

    const events =
        response.data?.events;

    if (
        !Array.isArray(events)
    ) {

        return [];
    }

    return events.filter(
        event =>
            event &&
            event.strHomeTeam &&
            event.strAwayTeam
    );
}

/* =========================================================
   NORMALIZE EVENT
========================================================= */

function normalizeEvent(
    event,
    index
) {

    const homeScore =
        Number(
            event.intHomeScore
        ) || 0;

    const awayScore =
        Number(
            event.intAwayScore
        ) || 0;

    const status =
        normalizeStatus(
            event.strStatus
        );

    const date =
        event.dateEvent
            ? `${event.dateEvent}T${event.strTime || '00:00:00'}`
            : new Date().toISOString();

    return {

        fixture: {

            id:
                event.idEvent ||
                `match-${index}`,

            date,

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
                translateLeague(
                    event.strLeague
                ),

            originalName:
                event.strLeague ||
                '',

            country:
                event.strCountry ||
                ''

        },

        teams: {

            home: {

                name:
                    translateTeam(
                        event.strHomeTeam
                    ),

                originalName:
                    event.strHomeTeam,

                logo:
                    event.strHomeTeamBadge ||
                    DEFAULT_LOGO

            },

            away: {

                name:
                    translateTeam(
                        event.strAwayTeam
                    ),

                originalName:
                    event.strAwayTeam,

                logo:
                    event.strAwayTeamBadge ||
                    DEFAULT_LOGO

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

        venue:
            event.strVenue ||
            '',

        city:
            event.strCity ||
            '',

        priority:
            getMatchPriority(event)

    };
}

/* =========================================================
   API MATCHES
========================================================= */

app.get(
    '/api/matches',
    async (req, res) => {

        const requestedDate =
            req.query.date ||
            new Date()
                .toISOString()
                .split('T')[0];

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
                    'التاريخ يجب أن يكون YYYY-MM-DD'

            });
        }

        const cacheKey =
            `football_${requestedDate}`;

        /* ---------------------------------------------
           CACHE
        --------------------------------------------- */

        const cached =
            cache.get(
                cacheKey
            );

        if (
            cached &&
            Date.now() <
                cached.expiresAt
        ) {

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
                    true

            });
        }

        try {

            /* -----------------------------------------
               FETCH
            ----------------------------------------- */

            const events =
                await fetchFootballMatches(
                    requestedDate
                );

            console.log(
                `📊 مباريات حقيقية: ${events.length}`
            );

            /* -----------------------------------------
               NORMALIZE
            ----------------------------------------- */

            let matches =
                events.map(
                    normalizeEvent
                );

            /* -----------------------------------------
               REMOVE DUPLICATES
            ----------------------------------------- */

            matches =
                Array.from(
                    new Map(
                        matches.map(
                            match => [
                                match.fixture.id,
                                match
                            ]
                        )
                    ).values()
                );

            /* -----------------------------------------
               SORT FOR VISITOR
            ----------------------------------------- */

            matches.sort(
                (a, b) => {

                    /*
                       1. LIVE / HT
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
                        b.priority !==
                        a.priority
                    ) {

                        return (
                            b.priority -
                            a.priority
                        );
                    }

                    /*
                       3. TIME
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

            /* -----------------------------------------
               CACHE
            ----------------------------------------- */

            cache.set(
                cacheKey,
                {

                    data:
                        matches,

                    expiresAt:
                        Date.now() +
                        CACHE_TIME

                }
            );

            /* -----------------------------------------
               SOCKET
            ----------------------------------------- */

            io.emit(
                'matchUpdate',
                {

                    date:
                        requestedDate,

                    matches

                }
            );

            /* -----------------------------------------
               RESPONSE
            ----------------------------------------- */

            return res.json({

                source:
                    'TheSportsDB API',

                data:
                    matches,

                count:
                    matches.length,

                date:
                    requestedDate,

                cached:
                    false,

                timestamp:
                    new Date().toISOString()

            });

        } catch (error) {

            console.error(
                '❌ خطأ في TheSportsDB:',
                error.message
            );

            if (
                error.response
            ) {

                console.error(
                    'HTTP:',
                    error.response.status
                );

                console.error(
                    error.response.data
                );
            }

            return res.status(502).json({

                source:
                    'TheSportsDB Error',

                data: [],

                count: 0,

                error:
                    error.message,

                date:
                    requestedDate

            });
        }
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
                API_KEY
                    ? 'موجود'
                    : 'غير موجود',

            database:
                DATABASE_URL
                    ? 'موجود'
                    : 'غير موجود',

            mongodb:
                mongoose.connection.readyState,

            timestamp:
                new Date().toISOString()

        });
    }
);

/* =========================================================
   TEST
========================================================= */

app.get(
    '/api/test',
    async (req, res) => {

        if (!API_KEY) {

            return res.status(500).json({

                status:
                    'error',

                message:
                    'THESPORTSDB_API_KEY غير موجود'

            });
        }

        const testDate =
            new Date()
                .toISOString()
                .split('T')[0];

        try {

            const events =
                await fetchFootballMatches(
                    testDate
                );

            return res.json({

                status:
                    'success',

                message:
                    'TheSportsDB يعمل بنجاح',

                date:
                    testDate,

                matchesFound:
                    events.length,

                timestamp:
                    new Date().toISOString()

            });

        } catch (error) {

            return res.status(502).json({

                status:
                    'error',

                message:
                    'فشل الاتصال بـ TheSportsDB',

                error:
                    error.message

            });
        }
    }
);

/* =========================================================
   FAVICON
========================================================= */

app.get(
    '/favicon.ico',
    (req, res) => {

        res.status(204).end();

    }
);

/* =========================================================
   HOME
========================================================= */

app.get(
    '/',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'live_modarraj_frontend.render.html'
            )
        );

    }
);

/* =========================================================
   SOCKET
========================================================= */

io.on(
    'connection',
    socket => {

        console.log(
            `🔌 اتصال جديد: ${socket.id}`
        );

        socket.on(
            'disconnect',
            () => {

                console.log(
                    `🔌 خروج: ${socket.id}`
                );

            }
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
                'الرابط غير موجود',

            path:
                req.path

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
            '════════════════════════════════════'
        );

        console.log(
            `🚀 Live Modarraj يعمل على ${PORT}`
        );

        console.log(
            `🔐 API Key: ${
                API_KEY
                    ? 'موجود'
                    : '❌ غير موجود'
            }`
        );

        console.log(
            `🗄️ DATABASE_URL: ${
                DATABASE_URL
                    ? 'موجود'
                    : '❌ غير موجود'
            }`
        );

        console.log(
            '════════════════════════════════════'
        );

    }
);

/* =========================================================
   PROCESS ERRORS
========================================================= */

process.on(
    'unhandledRejection',
    reason => {

        console.error(
            '❌ Unhandled Rejection:',
            reason
        );

    }
);

process.on(
    'uncaughtException',
    error => {

        console.error(
            '❌ Uncaught Exception:',
            error
        );

        process.exit(1);

    }
);
