import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import axios from 'axios';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';


// ============================================================
// ENV
// ============================================================

dotenv.config();


// ============================================================
// APP
// ============================================================

const app = express();

app.use(express.json());


// ============================================================
// PATH
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ============================================================
// STATIC FRONTEND
// ============================================================

app.use(express.static(__dirname));


// ============================================================
// CORS
// ============================================================

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


// ============================================================
// HTTP + SOCKET.IO
// ============================================================

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*'
    },

    allowEIO3: true
});


// ============================================================
// MONGODB DISABLED
// ============================================================
//
// لا نستخدم MongoDB.
// التخزين مؤقت داخل الذاكرة فقط.
// ============================================================

let localMemoryCache = {};


// ============================================================
// API KEY
// ============================================================

const API_KEY =
    process.env.THESPORTSDB_API_KEY ||
    '5010468507';


// ============================================================
// TIMEZONE
// ============================================================

const SAUDI_TIMEZONE =
    'Asia/Riyadh';


// ============================================================
// DATE FORMAT
// ============================================================
//
// TheSportsDB V1 eventsday.php يحتاج:
// DD.MM.YYYY
//
// مثال:
// 2026-08-13
// يصبح:
// 13.08.2026
// ============================================================

function formatDateForTheSportsDB(dateString) {

    try {

        if (
            typeof dateString !== 'string'
        ) {

            return dateString;

        }

        if (
            dateString.includes('-')
        ) {

            const [
                year,
                month,
                day
            ] = dateString.split('-');

            return `${day}.${month}.${year}`;

        }

        return dateString;

    } catch (error) {

        console.error(
            'خطأ في تحويل التاريخ:',
            error.message
        );

        return dateString;

    }

}


// ============================================================
// NORMALIZE TIME
// ============================================================
//
// نحول:
// 20:00:00
// إلى:
// 20:00
// ============================================================

function normalizeTime(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return '';

    }

    const text =
        String(value).trim();

    if (!text) {

        return '';

    }

    const match =
        text.match(
            /(\d{1,2}):(\d{2})/
        );

    if (!match) {

        return '';

    }

    const hour =
        String(
            Number(match[1])
        ).padStart(2, '0');

    const minute =
        match[2];

    return `${hour}:${minute}`;

}


// ============================================================
// GET SAUDI MATCH TIME
// ============================================================
//
// الأولوية:
//
// 1. strTimestamp
//    إذا كان موجودًا فهو أفضل لأنه يمثل لحظة زمنية حقيقية.
//
// 2. strTime
//    إذا لم يوجد timestamp نستخدم وقت المباراة الأصلي.
//    وهذا يمنع تحويله إلى 12:00 بسبب parsing غير صحيح.
//
// ============================================================

function getSaudiMatchTime(event) {

    try {

        // ----------------------------------------------------
        // أولًا: Timestamp حقيقي
        // ----------------------------------------------------

        if (
            event?.strTimestamp
        ) {

            const timestamp =
                new Date(
                    event.strTimestamp
                );

            if (
                !Number.isNaN(
                    timestamp.getTime()
                )
            ) {

                return timestamp.toLocaleTimeString(
                    'en-GB',
                    {
                        timeZone:
                            SAUDI_TIMEZONE,

                        hour:
                            '2-digit',

                        minute:
                            '2-digit',

                        hour12:
                            false
                    }
                );

            }

        }


        // ----------------------------------------------------
        // ثانيًا: strTime
        // ----------------------------------------------------

        const rawTime =
            normalizeTime(
                event?.strTime
            );


        if (rawTime) {

            return rawTime;

        }


        return '--:--';

    } catch (error) {

        console.error(
            'خطأ في معالجة وقت المباراة:',
            error.message
        );

        return '--:--';

    }

}


// ============================================================
// GET MATCH DATE
// ============================================================

function getMatchDate(event) {

    if (
        event?.dateEvent
    ) {

        return event.dateEvent;

    }

    return null;

}


// ============================================================
// CREATE FIXTURE DATE
// ============================================================
//
// إذا كان timestamp موجودًا نستخدمه.
//
// إذا لم يكن موجودًا، لا نضيف Z.
// لأن strTime في EventsDay قد يكون وقت المباراة
// وليس UTC.
// ============================================================

function getFixtureDate(event) {

    try {

        if (
            event?.strTimestamp
        ) {

            const timestamp =
                new Date(
                    event.strTimestamp
                );

            if (
                !Number.isNaN(
                    timestamp.getTime()
                )
            ) {

                return timestamp.toISOString();

            }

        }


        if (
            event?.dateEvent &&
            event?.strTime
        ) {

            const time =
                normalizeTime(
                    event.strTime
                );

            if (time) {

                return `${event.dateEvent}T${time}:00`;

            }

        }


        if (
            event?.dateEvent
        ) {

            return `${event.dateEvent}T00:00:00`;

        }


        return new Date().toISOString();

    } catch {

        return new Date().toISOString();

    }

}


// ============================================================
// GET STATUS
// ============================================================

function getMatchStatus(event) {

    const status =
        String(
            event?.strStatus || ''
        ).trim().toLowerCase();


    if (
        status === 'final' ||
        status === 'finished' ||
        status === 'ft'
    ) {

        return 'FT';

    }


    if (
        status === 'half time' ||
        status === 'halftime' ||
        status === 'ht'
    ) {

        return 'HT';

    }


    if (
        status === 'not started' ||
        status === 'scheduled' ||
        status === 'ns'
    ) {

        return 'NS';

    }


    if (
        event?.strProgress
    ) {

        return 'LIVE';

    }


    // إذا لم يرسل API حالة واضحة
    // لا نعتبر المباراة مباشرة تلقائيًا.
    return 'NS';

}


// ============================================================
// TV CHANNEL
// ============================================================
//
// مهم:
// لا نضع SSC / beIN بشكل افتراضي.
// إذا لم يرسل TheSportsDB قناة، لا تظهر.
// ============================================================

function getTVChannel(event) {

    const value =
        event?.strTVStation;

    if (
        value === null ||
        value === undefined
    ) {

        return '';

    }

    const channel =
        String(value).trim();

    if (
        !channel ||
        channel === '-' ||
        channel.toLowerCase() === 'null' ||
        channel.toLowerCase() === 'undefined'
    ) {

        return '';

    }

    return channel;

}


// ============================================================
// LEAGUES
// ============================================================
//
// نحافظ على نفس الدوريات التي تعمل حاليًا.
// ============================================================

const LEAGUES = [

    'English Premier League',

    'Serie A',

    'La Liga',

    'Ligue 1',

    'Bundesliga',

    'Saudi Professional League',

    'Egyptian Premier League',

    'UEFA Champions League'

];


// ============================================================
// API: MATCHES
// ============================================================

app.get(
    '/api/matches',
    async (req, res) => {

        const requestedDate =
            req.query.date ||
            new Date()
                .toISOString()
                .split('T')[0];


        const cacheKey =
            `sports_db_matches_${requestedDate}`;


        try {

            // =================================================
            // CACHE
            // =================================================

            if (
                localMemoryCache[cacheKey] &&
                Date.now() <
                    localMemoryCache[
                        cacheKey
                    ].expireAt
            ) {

                console.log(
                    `✅ Cache: ${requestedDate}`
                );


                return res.json({

                    source:
                        'Local Memory Cache',

                    data:
                        localMemoryCache[
                            cacheKey
                        ].data,

                    cached:
                        true,

                    count:
                        localMemoryCache[
                            cacheKey
                        ].data.length

                });

            }


            console.log('');
            console.log(
                '📡 جلب مباريات من TheSportsDB'
            );

            console.log(
                `📅 التاريخ: ${requestedDate}`
            );


            // =================================================
            // DATE
            // =================================================

            const formattedDate =
                formatDateForTheSportsDB(
                    requestedDate
                );


            console.log(
                `📅 API Date: ${formattedDate}`
            );


            console.log(
                `🔑 API Key: ${API_KEY.substring(0, 5)}...`
            );


            // =================================================
            // ALL EVENTS
            // =================================================

            let allEvents = [];


            // =================================================
            // GET EVENTS FROM LEAGUES
            // =================================================

            for (
                const league of LEAGUES
            ) {

                try {

                    console.log(
                        `🔗 جلب: ${league}`
                    );


                    const url =
                        `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsday.php?d=${formattedDate}&l=${encodeURIComponent(league)}`;


                    const response =
                        await axios.get(
                            url,
                            {
                                timeout:
                                    12000,

                                headers: {
                                    'User-Agent':
                                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                                }
                            }
                        );


                    if (
                        response.data &&
                        response.data.results
                    ) {

                        const leagueEvents =
                            Array.isArray(
                                response.data.results
                            )
                                ? response.data.results
                                : [
                                    response.data.results
                                ];


                        const validEvents =
                            leagueEvents.filter(
                                event =>
                                    event &&
                                    event.strHomeTeam &&
                                    event.strAwayTeam
                            );


                        console.log(
                            `   📊 ${validEvents.length} مباراة`
                        );


                        allEvents =
                            allEvents.concat(
                                validEvents
                            );

                    } else {

                        console.log(
                            `   ⚠️ لا توجد نتائج`
                        );

                    }

                } catch (error) {

                    console.log(
                        `   ❌ ${league}: ${error.message}`
                    );

                    continue;

                }

            }


            // =================================================
            // REMOVE DUPLICATES
            // =================================================

            const uniqueEvents =
                [];

            const seen =
                new Set();


            for (
                const event of allEvents
            ) {

                const eventId =
                    event.idEvent ||
                    `${event.dateEvent}-${event.strHomeTeam}-${event.strAwayTeam}`;


                if (
                    seen.has(eventId)
                ) {

                    continue;

                }


                seen.add(eventId);

                uniqueEvents.push(
                    event
                );

            }


            allEvents =
                uniqueEvents;


            console.log(
                `📊 إجمالي المباريات: ${allEvents.length}`
            );


            // =================================================
            // DEMO DATA
            // =================================================
            //
            // إذا لم توجد مباريات حقيقية، نرجع قائمة فارغة.
            // لا نعرض مباريات وهمية للمستخدم.
            // =================================================

            if (
                allEvents.length === 0
            ) {

                console.log(
                    '⚠️ لا توجد مباريات حقيقية لهذا التاريخ'
                );


                localMemoryCache[
                    cacheKey
                ] = {

                    data: [],

                    expireAt:
                        Date.now() +
                        60000

                };


                return res.json({

                    source:
                        'TheSportsDB API',

                    data: [],

                    count: 0,

                    date:
                        requestedDate,

                    cached:
                        false,

                    timestamp:
                        new Date().toISOString()

                });

            }


            // =================================================
            // NORMALIZE MATCHES
            // =================================================

            const standardMatches =
                allEvents
                    .filter(
                        event =>
                            event &&
                            event.strHomeTeam &&
                            event.strAwayTeam
                    )
                    .map(
                        (event, index) => {

                            // ---------------------------------
                            // SCORE
                            // ---------------------------------

                            const homeScore =
                                event.intHomeScore !== null &&
                                event.intHomeScore !== undefined &&
                                event.intHomeScore !== ''
                                    ? Number(
                                        event.intHomeScore
                                    )
                                    : null;


                            const awayScore =
                                event.intAwayScore !== null &&
                                event.intAwayScore !== undefined &&
                                event.intAwayScore !== ''
                                    ? Number(
                                        event.intAwayScore
                                    )
                                    : null;


                            // ---------------------------------
                            // TIME
                            // ---------------------------------

                            const matchTime =
                                getSaudiMatchTime(
                                    event
                                );


                            // ---------------------------------
                            // DATE
                            // ---------------------------------

                            const fixtureDate =
                                getFixtureDate(
                                    event
                                );


                            // ---------------------------------
                            // STATUS
                            // ---------------------------------

                            const statusShort =
                                getMatchStatus(
                                    event
                                );


                            // ---------------------------------
                            // CHANNEL
                            // ---------------------------------

                            const channel =
                                getTVChannel(
                                    event
                                );


                            // ---------------------------------
                            // MATCH OBJECT
                            // ---------------------------------

                            return {

                                fixture: {

                                    id:
                                        event.idEvent ||
                                        `match-${index}`,

                                    date:
                                        fixtureDate,

                                    // مهم جدًا للواجهة
                                    time:
                                        matchTime,

                                    status: {

                                        short:
                                            statusShort,

                                        elapsed:
                                            event.strProgress ||
                                            ''

                                    }

                                },


                                league: {

                                    name:
                                        event.strLeague ||
                                        'Other Competitions'

                                },


                                teams: {

                                    home: {

                                        name:
                                            event.strHomeTeam ||
                                            'Unknown Team',

                                        logo:
                                            event.strHomeTeamBadge ||
                                            'https://www.thesportsdb.com/images/media/team/badge/default.png'

                                    },


                                    away: {

                                        name:
                                            event.strAwayTeam ||
                                            'Unknown Team',

                                        logo:
                                            event.strAwayTeamBadge ||
                                            'https://www.thesportsdb.com/images/media/team/badge/default.png'

                                    }

                                },


                                goals: {

                                    home:
                                        Number.isNaN(
                                            homeScore
                                        )
                                            ? null
                                            : homeScore,

                                    away:
                                        Number.isNaN(
                                            awayScore
                                        )
                                            ? null
                                            : awayScore

                                },


                                media: {

                                    // فارغ إذا لا توجد قناة
                                    channel:
                                        channel,

                                    commentator:
                                        event.strCommentator ||
                                        ''

                                }

                            };

                        }
                    );


            // =================================================
            // SORT
            // =================================================
            //
            // المباريات المباشرة أولًا
            // ثم وقت المباراة.
            // =================================================

            standardMatches.sort(
                (a, b) => {

                    const liveA =
                        [
                            'LIVE',
                            'HT'
                        ].includes(
                            a.fixture.status.short
                        );


                    const liveB =
                        [
                            'LIVE',
                            'HT'
                        ].includes(
                            b.fixture.status.short
                        );


                    if (
                        liveA !== liveB
                    ) {

                        return liveA
                            ? -1
                            : 1;

                    }


                    const timeA =
                        new Date(
                            a.fixture.date
                        ).getTime();


                    const timeB =
                        new Date(
                            b.fixture.date
                        ).getTime();


                    return (
                        timeA -
                        timeB
                    );

                }
            );


            console.log(
                `✅ تم معالجة ${standardMatches.length} مباراة`
            );


            // =================================================
            // CACHE
            // =================================================

            localMemoryCache[
                cacheKey
            ] = {

                data:
                    standardMatches,

                expireAt:
                    Date.now() +
                    60000

            };


            // =================================================
            // SOCKET UPDATE
            // =================================================

            io.emit(
                'matchUpdate',
                {
                    date:
                        requestedDate,

                    matches:
                        standardMatches
                }
            );


            // =================================================
            // RESPONSE
            // =================================================

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
                '❌ خطأ عام في جلب المباريات:',
                error.message
            );


            if (
                error.response
            ) {

                console.error(
                    '📍 HTTP:',
                    error.response.status
                );

                console.error(
                    '📝 API:',
                    error.response.data
                );

            }


            return res.status(
                500
            ).json({

                source:
                    'Error',

                data: [],

                error:
                    error.message,

                timestamp:
                    new Date().toISOString()

            });

        }

    }
);


// ============================================================
// FRONTEND
// ============================================================

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


// ============================================================
// HEALTH
// ============================================================

app.get(
    '/api/health',
    (req, res) => {

        res.json({

            status:
                'ok',

            server:
                'Live Modarraj',

            database:
                'disabled - memory cache only',

            apiKey:
                process.env.THESPORTSDB_API_KEY
                    ? 'موجود'
                    : 'موجود عبر fallback',

            nodeVersion:
                process.version,

            environment:
                process.env.NODE_ENV ||
                'development',

            timezone:
                SAUDI_TIMEZONE,

            timestamp:
                new Date().toISOString()

        });

    }
);


// ============================================================
// API TEST
// ============================================================

app.get(
    '/api/test',
    async (req, res) => {

        try {

            const testDate =
                '12.08.2026';


            const testUrl =
                `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsday.php?d=${testDate}&l=English%20Premier%20League`;


            console.log(
                '🧪 اختبار الاتصال بـ TheSportsDB'
            );


            const response =
                await axios.get(
                    testUrl,
                    {
                        timeout:
                            10000
                    }
                );


            const results =
                response.data?.results;


            const count =
                Array.isArray(
                    results
                )
                    ? results.length
                    : results
                        ? 1
                        : 0;


            return res.json({

                status:
                    'success',

                message:
                    'اتصال TheSportsDB يعمل',

                date:
                    testDate,

                matches:
                    count,

                api:
                    'V1 Events Day',

                timestamp:
                    new Date().toISOString()

            });


        } catch (error) {

            return res.status(
                500
            ).json({

                status:
                    'error',

                message:
                    'فشل اختبار الاتصال',

                error:
                    error.message,

                timestamp:
                    new Date().toISOString()

            });

        }

    }
);


// ============================================================
// 404
// ============================================================

app.use(
    (req, res) => {

        res.status(
            404
        ).json({

            error:
                'الرابط المطلوب غير موجود',

            path:
                req.path,

            method:
                req.method

        });

    }
);


// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
    (err, req, res, next) => {

        console.error(
            '❌ خطأ غير متوقع:',
            err
        );


        res.status(
            500
        ).json({

            error:
                'حدث خطأ في السيرفر',

            message:
                err.message

        });

    }
);


// ============================================================
// PORT
// ============================================================

const PORT =
    process.env.PORT ||
    5000;


// ============================================================
// START SERVER
// ============================================================

server.listen(
    PORT,
    () => {

        console.log('');
        console.log(
            '════════════════════════════════════════════════════════════'
        );

        console.log(
            `🚀 Live Modarraj يعمل على المنفذ ${PORT}`
        );

        console.log(
            '════════════════════════════════════════════════════════════'
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
            `🕐 Timezone: ${SAUDI_TIMEZONE}`
        );

        console.log(
            '💾 Database: Disabled - Memory Cache'
        );

        console.log(
            '════════════════════════════════════════════════════════════'
        );

        console.log('');

    }
);


// ============================================================
// PROCESS ERRORS
// ============================================================

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
