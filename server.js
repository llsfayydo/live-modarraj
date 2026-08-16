import express from "express";
import http from "http";
import { Server } from "socket.io";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET"]
    }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;
const API_KEY = process.env.THESPORTSDB_API_KEY;

const cache = new Map();
const CACHE_TIME = 30 * 1000;

const api = axios.create({
    timeout: 20000,
    headers: {
        "User-Agent": "Modarraj-Live/1.0",
        "Accept": "application/json"
    }
});

app.use(express.json());
app.use(express.static(__dirname));

/* =========================
   League Priority
========================= */

const LEAGUES = {
    "FIFA World Cup": 120,
    "World Cup": 120,

    "UEFA Champions League": 115,
    "UEFA Europa League": 110,
    "UEFA Europa Conference League": 105,

    "English Premier League": 100,
    "Premier League": 100,

    "La Liga": 98,
    "Serie A": 96,
    "Bundesliga": 94,
    "Ligue 1": 92,

    "Saudi Pro League": 90,
    "Saudi Professional League": 90,
    "Saudi-Arabian Pro League": 90,

    "AFC Champions League Elite": 88,
    "AFC Champions League": 86,

    "Moroccan Botola": 84,
    "Botola Pro": 84,

    "Egyptian Premier League": 82,
    "Qatar Stars League": 80,
    "UAE Pro League": 78,
    "Iraq Stars League": 76,
    "Kuwait Premier League": 74,
    "Tunisian Ligue 1": 72,
    "Algeria Ligue 1": 70,

    "Africa Cup of Nations": 90,
    "AFC Asian Cup": 90,
    "Asian Cup": 90
};


/* =========================
   Helpers
========================= */

function getDate() {

    return new Date()
        .toISOString()
        .slice(0, 10);

}


function getStatus(event) {

    const status = String(
        event?.strStatus || ""
    ).toUpperCase();

    const progress = String(
        event?.strProgress || ""
    ).toUpperCase();


    if (
        ["LIVE", "1H", "2H", "ET", "P"].includes(status)
    ) {

        return "LIVE";

    }


    if (
        status === "HT" ||
        progress.includes("HALF")
    ) {

        return "HT";

    }


    if (
        ["FT", "FINAL", "AET", "PEN"].includes(status) ||
        progress === "FINAL"
    ) {

        return "FT";

    }


    return "NS";

}


function leaguePriority(name) {

    const value =
        String(name || "");

    return LEAGUES[value] ?? 20;

}


/* =========================
   Normalize
========================= */

function normalize(event, source) {

    /*
     * مهم:
     *
     * إذا كان API يرسل strTimestamp
     * نحتفظ به كما هو.
     *
     * الواجهة هي التي ستقوم بتحويله
     * إلى توقيت جهاز المستخدم.
     *
     * لا نفرض Asia/Riyadh هنا.
     */

    let matchTime =
        event?.strTimestamp ||
        event?.strEventTime ||
        "";


    /*
     * إذا كان الوقت بصيغة:
     *
     * 20:00:00
     *
     * نحوله إلى:
     *
     * 20:00
     *
     * فقط عندما لا يكون Timestamp.
     */

    if (
        matchTime &&
        !String(matchTime).includes("T") &&
        !String(matchTime).includes("Z") &&
        !String(matchTime).includes("+") &&
        /^\d{2}:\d{2}:\d{2}$/.test(
            String(matchTime)
        )
    ) {

        matchTime =
            String(matchTime).substring(
                0,
                5
            );

    }


    return {

        fixture: {

            id:
                event?.idEvent ||
                event?.idLiveScore ||
                `${event?.idHomeTeam || ""}-${event?.idAwayTeam || ""}-${event?.dateEvent || ""}`,

            date:
                event?.strTimestamp ||
                event?.dateEvent ||
                "",

            /*
             * مهم للواجهة:
             * إذا كان Timestamp موجودًا
             * نرسله بدون تحويل.
             */

            time:
                matchTime,

            status: {

                short:
                    getStatus(event),

                progress:
                    event?.strProgress ||
                    ""

            }

        },


        league: {

            id:
                event?.idLeague ||
                "",

            name:
                event?.strLeague ||
                "Other",

            country:
                event?.strCountry ||
                ""

        },


        teams: {

            home: {

                id:
                    event?.idHomeTeam ||
                    "",

                name:
                    event?.strHomeTeam ||
                    "Unknown Team",

                logo:
                    event?.strHomeTeamBadge ||
                    ""

            },


            away: {

                id:
                    event?.idAwayTeam ||
                    "",

                name:
                    event?.strAwayTeam ||
                    "Unknown Team",

                logo:
                    event?.strAwayTeamBadge ||
                    ""

            }

        },


        goals: {

            home:
                event?.intHomeScore ??
                null,

            away:
                event?.intAwayScore ??
                null

        },


        media: {

            channel:
                event?.strTVStation ||
                "",

            commentator:
                event?.strCommentator ||
                ""

        },


        venue:
            event?.strVenue ||
            "",


        city:
            event?.strCity ||
            "",


        source

    };

}


/* =========================
   V1 Events Day
========================= */

async function fetchEventsDay(date) {

    if (!API_KEY) {

        throw new Error(
            "THESPORTSDB_API_KEY is missing"
        );

    }


    const url =
        `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsday.php?d=${date}&s=Soccer`;


    try {

        const response =
            await api.get(url);


        return Array.isArray(
            response.data?.events
        )
            ? response.data.events
            : [];


    } catch (error) {

        console.error(
            "Events Day error:",
            error.response?.status ||
            error.message
        );


        return [];

    }

}


/* =========================
   V2 Livescore
========================= */

async function fetchLivescores() {

    if (!API_KEY) {

        return [];

    }


    try {

        const response =
            await api.get(
                "https://www.thesportsdb.com/api/v2/json/livescore/soccer",
                {
                    headers: {

                        "X-API-KEY":
                            API_KEY,

                        "Content-Type":
                            "application/json"

                    }
                }
            );


        const body =
            response.data;


        if (Array.isArray(body)) {

            return body;

        }


        if (
            Array.isArray(
                body?.data
            )
        ) {

            return body.data;

        }


        if (
            Array.isArray(
                body?.livescores
            )
        ) {

            return body.livescores;

        }


        if (
            Array.isArray(
                body?.events
            )
        ) {

            return body.events;

        }


        return [];


    } catch (error) {

        console.error(
            "Livescore error:",
            error.response?.status ||
            error.message
        );


        return [];

    }

}


/* =========================
   Merge
========================= */

function merge(events) {

    const map =
        new Map();


    for (
        const event of events
    ) {

        if (!event) {
            continue;
        }


        const id =
            event.idEvent ||
            event.idLiveScore;


        if (!id) {
            continue;
        }


        const old =
            map.get(
                String(id)
            );


        if (!old) {

            map.set(
                String(id),
                event
            );

            continue;

        }


        const oldStatus =
            getStatus(old);


        const newStatus =
            getStatus(event);


        if (
            newStatus === "LIVE" ||
            newStatus === "HT"
        ) {

            map.set(
                String(id),
                event
            );

        } else if (
            oldStatus === "NS"
        ) {

            map.set(
                String(id),
                event
            );

        }

    }


    return [
        ...map.values()
    ];

}


/* =========================
   Sort
========================= */

function sortMatches(matches) {

    return matches.sort(
        (a, b) => {

            const aLive =
                ["LIVE", "HT"].includes(
                    a.fixture.status.short
                );


            const bLive =
                ["LIVE", "HT"].includes(
                    b.fixture.status.short
                );


            if (
                aLive !== bLive
            ) {

                return bLive - aLive;

            }


            const aPriority =
                leaguePriority(
                    a.league.name
                );


            const bPriority =
                leaguePriority(
                    b.league.name
                );


            if (
                aPriority !==
                bPriority
            ) {

                return (
                    bPriority -
                    aPriority
                );

            }


            return String(
                a.fixture.time
            ).localeCompare(
                String(
                    b.fixture.time
                )
            );

        }
    );

}


/* =========================
   Main Fetch
========================= */

async function getMatches(date) {

    const key =
        `matches-${date}`;


    const cached =
        cache.get(key);


    if (
        cached &&
        Date.now() <
        cached.expires
    ) {

        return {

            data:
                cached.data,

            cached:
                true

        };

    }


    const day =
        await fetchEventsDay(date);


    const today =
        getDate();


    let live = [];


    if (
        date === today
    ) {

        live =
            await fetchLivescores();

    }


    const all =
        merge([
            ...day,
            ...live
        ]);


    let matches =
        all.map(
            event =>
                normalize(
                    event,
                    live.includes(event)
                        ? "TheSportsDB V2"
                        : "TheSportsDB V1"
                )
        );


    const unique =
        new Map();


    for (
        const match of matches
    ) {

        unique.set(
            String(
                match.fixture.id
            ),
            match
        );

    }


    matches = [
        ...unique.values()
    ];


    sortMatches(
        matches
    );


    cache.set(
        key,
        {

            data:
                matches,

            expires:
                Date.now() +
                CACHE_TIME

        }
    );


    return {

        data:
            matches,

        cached:
            false

    };

}


/* =========================
   Matches API
========================= */

app.get(
    "/api/matches",
    async (req, res) => {

        const date =
            req.query.date ||
            getDate();


        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(
                date
            )
        ) {

            return res.status(400).json({

                source:
                    "Validation",

                data: [],

                count: 0,

                date,

                error:
                    "Invalid date format"

            });

        }


        try {

            const result =
                await getMatches(date);


            io.emit(
                "matches",
                {

                    date,

                    data:
                        result.data

                }
            );


            res.json({

                source:
                    result.cached
                        ? "Memory Cache"
                        : "TheSportsDB API",

                data:
                    result.data,

                count:
                    result.data.length,

                date,

                cached:
                    result.cached,

                timestamp:
                    new Date().toISOString()

            });


        } catch (error) {

            console.error(
                "API matches:",
                error
            );


            res.status(500).json({

                source:
                    "Server",

                data: [],

                count: 0,

                date,

                error:
                    error.message

            });

        }

    }
);


/* =========================
   Live Test
========================= */

app.get(
    "/api/test/live",
    async (req, res) => {

        const data =
            await fetchLivescores();


        res.json({

            status:
                "success",

            source:
                "TheSportsDB V2 Livescore",

            matches:
                data.length,

            data,

            timestamp:
                new Date().toISOString()

        });

    }
);


/* =========================
   Health
========================= */

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            status:
                "ok",

            server:
                "Modarraj Live",

            database:
                "disabled",

            apiKey:
                API_KEY
                    ? "present"
                    : "missing",

            timestamp:
                new Date().toISOString()

        });

    }
);


/* =========================
   Frontend
========================= */

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "index.html"
            )
        );

    }
);


/* =========================
   404
========================= */

app.use(
    (req, res) => {

        res.status(404).json({

            error:
                "Route not found",

            path:
                req.path,

            method:
                req.method

        });

    }
);


/* =========================
   Socket
========================= */

io.on(
    "connection",
    socket => {

        console.log(
            "Socket connected:",
            socket.id
        );


        socket.on(
            "disconnect",
            () => {

                console.log(
                    "Socket disconnected:",
                    socket.id
                );

            }
        );

    }
);


/* =========================
   Start
========================= */

server.listen(
    PORT,
    () => {

        console.log(
            `Modarraj Live listening on ${PORT}`
        );

        console.log(
            `TheSportsDB API: ${
                API_KEY
                    ? "configured"
                    : "missing"
            }`
        );

    }
);
