import express from "express";
import http from "http";
import { Server } from "socket.io";
import axios from "axios";
import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    },
    allowEIO3: true
});

app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(__dirname));


// ============================================================
// CORS
// ============================================================

app.use((req, res, next) => {

    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }

    next();

});


// ============================================================
// CONFIG
// ============================================================

const API_KEY =
    process.env.THESPORTSDB_API_KEY ||
    "5010468507";

const PORT =
    process.env.PORT ||
    5000;

const SAUDI_TIMEZONE =
    "Asia/Riyadh";


// ============================================================
// MEMORY CACHE
// ============================================================
//
// MongoDB غير مستخدم.
// البيانات تحفظ مؤقتًا في الذاكرة فقط.
// ============================================================

const memoryCache = new Map();

const CACHE_TIME =
    60 * 1000;


// ============================================================
// LEAGUES
// ============================================================

const LEAGUES = [

    "English Premier League",

    "Serie A",

    "La Liga",

    "Ligue 1",

    "Bundesliga",

    "Saudi Professional League",

    "Egyptian Premier League",

    "UEFA Champions League"

];


// ============================================================
// DATE
// ============================================================

function formatDateForTheSportsDB(dateString) {

    if (!dateString) {
        return dateString;
    }

    if (
        typeof dateString !== "string"
    ) {
        return dateString;
    }

    if (
        dateString.includes("-")
    ) {

        const parts =
            dateString.split("-");

        if (parts.length === 3) {

            const year = parts[0];
            const month = parts[1];
            const day = parts[2];

            return `${day}.${month}.${year}`;

        }

    }

    return dateString;

}


// ============================================================
// TIME NORMALIZATION
// ============================================================

function normalizeTime(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    const text =
        String(value).trim();

    if (!text) {
        return "";
    }

    const match =
        text.match(
            /(\d{1,2}):(\d{2})/
        );

    if (!match) {
        return "";
    }

    const hour =
        String(
            Number(match[1])
        ).padStart(2, "0");

    const minute =
        match[2];

    return `${hour}:${minute}`;

}


// ============================================================
// SAUDI TIME FROM TIMESTAMP
// ============================================================

function timestampToSaudiTime(timestamp) {

    if (!timestamp) {
        return "";
    }

    const date =
        new Date(timestamp);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "";
    }

    return date.toLocaleTimeString(
        "en-GB",
        {
            timeZone:
                SAUDI_TIMEZONE,

            hour:
                "2-digit",

            minute:
                "2-digit",

            hour12:
                false
        }
    );

}


// ============================================================
// MATCH TIME
// ============================================================
//
// الأولوية:
// 1. strTimestamp
// 2. strTime
//
// لا نستخدم 00:00 كقيمة افتراضية.
// ============================================================

function getMatchTime(event) {

    // --------------------------------------------------------
    // Timestamp
    // --------------------------------------------------------

    if (
        event &&
        event.strTimestamp
    ) {

        const timestampTime =
            timestampToSaudiTime(
                event.strTimestamp
            );

        if (timestampTime) {
            return timestampTime;
        }

    }


    // --------------------------------------------------------
    // strTime
    // --------------------------------------------------------

    const directTime =
        normalizeTime(
            event?.strTime
        );

    if (directTime) {
        return directTime;
    }


    // --------------------------------------------------------
    // No time
    // --------------------------------------------------------

    return "--:--";

}


// ============================================================
// MATCH DATE
// ============================================================

function getMatchDate(event) {

    if (
        event?.strTimestamp
    ) {

        const date =
            new Date(
                event.strTimestamp
            );

        if (
            !Number.isNaN(
                date.getTime()
            )
        ) {

            return date.toISOString();

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

        return event.dateEvent;

    }


    return null;

}


// ============================================================
// STATUS
// ============================================================

function getMatchStatus(event) {

    const status =
        String(
            event?.strStatus || ""
        )
        .trim()
        .toLowerCase();


    if (
        status === "final" ||
        status === "finished" ||
        status === "ft"
    ) {

        return "FT";

    }


    if (
        status === "half time" ||
        status === "halftime" ||
        status === "ht"
    ) {

        return "HT";

    }


    if (
        status === "not started" ||
        status === "scheduled" ||
        status === "ns"
    ) {

        return "NS";

    }


    if (
        event?.strProgress
    ) {

        return "LIVE";

    }


    return "NS";

}


// ============================================================
// TV CHANNEL
// ============================================================
//
// لا نضع قناة افتراضية.
// ============================================================

function getTVChannel(event) {

    const value =
        event?.strTVStation;

    if (
        value === null ||
        value === undefined
    ) {

        return "";

    }

    const channel =
        String(value).trim();

    if (!channel) {
        return "";
    }

    if (
        channel === "-" ||
        channel.toLowerCase() === "null" ||
        channel.toLowerCase() === "undefined"
    ) {

        return "";

    }

    return channel;

}


// ============================================================
// NORMALIZE EVENT
// ============================================================

function normalizeEvent(event, index) {

    const homeScore =
        event.intHomeScore !== null &&
        event.intHomeScore !== undefined &&
        event.intHomeScore !== ""
            ? Number(event.intHomeScore)
            : null;


    const awayScore =
        event.intAwayScore !== null &&
        event.intAwayScore !== undefined &&
        event.intAwayScore !== ""
            ? Number(event.intAwayScore)
            : null;


    const matchTime =
        getMatchTime(event);


    const matchDate =
        getMatchDate(event);


    const status =
        getMatchStatus(event);


    const channel =
        getTVChannel(event);


    return {

        fixture: {

            id:
                event.idEvent ||
                `match-${index}`,

            date:
                matchDate,

            time:
                matchTime,

            status: {

                short:
                    status,

                elapsed:
                    event.strProgress ||
                    ""

            }

        },


        league: {

            name:
                event.strLeague ||
                "Other Competitions"

        },


        teams: {

            home: {

                name:
                    event.strHomeTeam ||
                    "Unknown Team",

                logo:
                    event.strHomeTeamBadge ||
                    "https://www.thesportsdb.com/images/media/team/badge/default.png"

            },

            away: {

                name:
                    event.strAwayTeam ||
                    "Unknown Team",

                logo:
                    event.strAwayTeamBadge ||
                    "https://www.thesportsdb.com/images/media/team/badge/default.png"

            }

        },


        goals: {

            home:
                Number.isFinite(homeScore)
                    ? homeScore
                    : null,

            away:
                Number.isFinite(awayScore)
                    ? awayScore
                    : null

        },


        media: {

            channel:
                channel,

            commentator:
                event.strCommentator ||
                ""

        }

    };

}


// ============================================================
// SORT
// ============================================================
//
// Live / HT أولًا.
// ثم وقت المباراة.
// ============================================================

function sortMatches(matches) {

    return matches.sort(
        (a, b) => {

            const liveA =
                a.fixture.status.short === "LIVE" ||
                a.fixture.status.short === "HT";


            const liveB =
                b.fixture.status.short === "LIVE" ||
                b.fixture.status.short === "HT";


            if (
                liveA !== liveB
            ) {

                return liveA
                    ? -1
                    : 1;

            }


            const dateA =
                a.fixture.date
                    ? new Date(
                        a.fixture.date
                    ).getTime()
                    : Number.MAX_SAFE_INTEGER;


            const dateB =
                b.fixture.date
                    ? new Date(
                        b.fixture.date
                    ).getTime()
                    : Number.MAX_SAFE_INTEGER;


            if (
                Number.isFinite(dateA) &&
                Number.isFinite(dateB)
            ) {

                return dateA - dateB;

            }


            return 0;

        }
    );

}


// ============================================================
// GET MATCHES
// ============================================================

app.get(
    "/api/matches",
    async (req, res) => {

        const requestedDate =
            req.query.date ||
            new Date()
                .toISOString()
                .split("T")[0];


        const cacheKey =
            `matches:${requestedDate}`;


        // ----------------------------------------------------
        // CACHE
        // ----------------------------------------------------

        const cached =
            memoryCache.get(
                cacheKey
            );


        if (
            cached &&
            Date.now() -
                cached.timestamp <
                CACHE_TIME
        ) {

            return res.json({

                source:
                    "TheSportsDB API",

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


        try {

            console.log("");
            console.log(
                "📡 TheSportsDB"
            );

            console.log(
                `📅 ${requestedDate}`
            );


            const apiDate =
                formatDateForTheSportsDB(
                    requestedDate
                );


            let allEvents = [];


            // =================================================
            // GET EVENTS
            // =================================================

            for (
                const league of LEAGUES
            ) {

                try {

                    const url =
                        `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsday.php?d=${apiDate}&l=${encodeURIComponent(league)}`;


                    const response =
                        await axios.get(
                            url,
                            {
                                timeout:
                                    12000,

                                headers: {

                                    "User-Agent":
                                        "Live-Modarraj/1.0"

                                }

                            }
                        );


                    const results =
                        response.data?.events ||
                        response.data?.results ||
                        [];


                    const events =
                        Array.isArray(results)
                            ? results
                            : [];


                    const validEvents =
                        events.filter(
                            event =>
                                event &&
                                event.strHomeTeam &&
                                event.strAwayTeam
                        );


                    console.log(
                        `${league}: ${validEvents.length}`
                    );


                    allEvents.push(
                        ...validEvents
                    );


                } catch (error) {

                    console.error(
                        `❌ ${league}:`,
                        error.message
                    );

                }

            }


            // =================================================
            // REMOVE DUPLICATES
            // =================================================

            const seen =
                new Set();

            const uniqueEvents =
                [];


            for (
                const event of allEvents
            ) {

                const key =
                    event.idEvent ||
                    `${event.dateEvent}|${event.strHomeTeam}|${event.strAwayTeam}`;


                if (
                    seen.has(key)
                ) {

                    continue;

                }


                seen.add(key);

                uniqueEvents.push(
                    event
                );

            }


            // =================================================
            // NORMALIZE
            // =================================================

            let matches =
                uniqueEvents.map(
                    normalizeEvent
                );


            // =================================================
            // SORT
            // =================================================

            matches =
                sortMatches(
                    matches
                );


            // =================================================
            // CACHE
            // =================================================

            memoryCache.set(
                cacheKey,
                {
                    data:
                        matches,

                    timestamp:
                        Date.now()
                }
            );


            // =================================================
            // SOCKET
            // =================================================

            io.emit(
                "matchUpdate",
                {
                    date:
                        requestedDate,

                    matches:
                        matches
                }
            );


            // =================================================
            // RESPONSE
            // =================================================

            return res.json({

                source:
                    "TheSportsDB API",

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
                "❌ API ERROR:",
                error.message
            );


            return res.status(
                500
            ).json({

                source:
                    "TheSportsDB API",

                data: [],

                count: 0,

                date:
                    requestedDate,

                cached:
                    false,

                error:
                    error.message,

                timestamp:
                    new Date().toISOString()

            });

        }

    }
);


// ============================================================
// HEALTH
// ============================================================

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            status:
                "ok",

            server:
                "Live Modarraj",

            database:
                "disabled - memory cache only",

            apiKey:
                process.env.THESPORTSDB_API_KEY
                    ? "موجود"
                    : "موجود عبر fallback",

            nodeVersion:
                process.version,

            environment:
                process.env.NODE_ENV ||
                "development",

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
    "/api/test",
    async (req, res) => {

        try {

            const testDate =
                "12.08.2026";


            const url =
                `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsday.php?d=${testDate}&l=${encodeURIComponent("English Premier League")}`;


            const response =
                await axios.get(
                    url,
                    {
                        timeout:
                            10000
                    }
                );


            const results =
                response.data?.events ||
                response.data?.results ||
                [];


            const count =
                Array.isArray(results)
                    ? results.length
                    : 0;


            return res.json({

                status:
                    "success",

                message:
                    "اتصال TheSportsDB يعمل",

                date:
                    testDate,

                matches:
                    count,

                api:
                    "V1 Events Day",

                timestamp:
                    new Date().toISOString()

            });


        } catch (error) {

            return res.status(
                500
            ).json({

                status:
                    "error",

                message:
                    "فشل اختبار الاتصال",

                error:
                    error.message,

                timestamp:
                    new Date().toISOString()

            });

        }

    }
);


// ============================================================
// ROOT
// ============================================================

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "live_modarraj_frontend.html"
            )
        );

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
                "الرابط المطلوب غير موجود",

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
            "❌ Server Error:",
            err
        );


        res.status(
            500
        ).json({

            error:
                "حدث خطأ في السيرفر",

            message:
                err.message

        });

    }
);


// ============================================================
// START
// ============================================================

server.listen(
    PORT,
    () => {

        console.log("");
        console.log(
            "════════════════════════════════════════"
        );

        console.log(
            `🚀 Live Modarraj`
        );

        console.log(
            `🌐 Port: ${PORT}`
        );

        console.log(
            `🕐 Timezone: ${SAUDI_TIMEZONE}`
        );

        console.log(
            "💾 Database: Disabled"
        );

        console.log(
            "📡 TheSportsDB: Connected"
        );

        console.log(
            "════════════════════════════════════════"
        );

        console.log("");

    }
);


// ============================================================
// PROCESS ERRORS
// ============================================================

process.on(
    "unhandledRejection",
    reason => {

        console.error(
            "❌ Unhandled Rejection:",
            reason
        );

    }
);


process.on(
    "uncaughtException",
    error => {

        console.error(
            "❌ Uncaught Exception:",
            error
        );

    }
);
