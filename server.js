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

/* =========================
   Middleware
========================= */

app.use(express.json());
app.use(express.static(__dirname));

/* =========================
   League Priority
========================= */

const LEAGUES = {
    /* World */
    "FIFA World Cup": 120,
    "World Cup": 120,
    "FIFA Club World Cup": 118,
    "Club World Cup": 118,

    /* Europe */
    "UEFA Champions League": 115,
    "Champions League": 115,
    "UEFA Europa League": 110,
    "Europa League": 110,
    "UEFA Europa Conference League": 105,
    "Europa Conference League": 105,

    /* Major European Leagues */
    "English Premier League": 100,
    "Premier League": 100,

    "La Liga": 98,
    "Spanish La Liga": 98,

    "Serie A": 96,
    "Italian Serie A": 96,

    "Bundesliga": 94,
    "German Bundesliga": 94,

    "Ligue 1": 92,
    "French Ligue 1": 92,

    /* Saudi */
    "Saudi Pro League": 90,
    "Saudi Professional League": 90,
    "Saudi-Arabian Pro League": 90,
    "Saudi League": 90,

    /* Asian competitions */
    "AFC Champions League Elite": 88,
    "AFC Champions League": 86,
    "AFC Champions League 2": 84,

    /* Arab leagues */
    "Moroccan Botola": 84,
    "Botola Pro": 84,
    "Botola": 84,

    "Egyptian Premier League": 82,

    "Qatar Stars League": 80,
    "Qatar League": 80,

    "UAE Pro League": 78,
    "UAE League": 78,

    "Iraq Stars League": 76,
    "Iraqi Premier League": 76,

    "Kuwait Premier League": 74,

    "Tunisian Ligue 1": 72,
    "Tunisian Ligue Professionnelle 1": 72,

    "Algeria Ligue 1": 70,
    "Algerian Ligue 1": 70,

    /* National tournaments */
    "Africa Cup of Nations": 90,
    "African Cup of Nations": 90,

    "AFC Asian Cup": 90,
    "Asian Cup": 90
};

/* =========================
   League Priority
   Flexible matching
========================= */

function leaguePriority(name) {

    const value = String(name || "").trim();

    if (LEAGUES[value] !== undefined) {
        return LEAGUES[value];
    }

    const lower = value.toLowerCase();

    /* World */
    if (
        lower.includes("world cup") ||
        lower.includes("fifa world")
    ) {
        return 120;
    }

    if (
        lower.includes("club world")
    ) {
        return 118;
    }

    /* Europe */
    if (
        lower.includes("champions league")
    ) {
        return 115;
    }

    if (
        lower.includes("europa conference")
    ) {
        return 105;
    }

    if (
        lower.includes("europa league")
    ) {
        return 110;
    }

    /* England */
    if (
        lower.includes("premier league") &&
        (
            lower.includes("english") ||
            !lower.includes("saudi")
        )
    ) {
        return 100;
    }

    /* Spain */
    if (
        lower.includes("la liga")
    ) {
        return 98;
    }

    /* Italy */
    if (
        lower.includes("serie a")
    ) {
        return 96;
    }

    /* Germany */
    if (
        lower.includes("bundesliga")
    ) {
        return 94;
    }

    /* France */
    if (
        lower.includes("ligue 1")
    ) {
        return 92;
    }

    /* Saudi */
    if (
        lower.includes("saudi") ||
        lower.includes("saudi-arabian")
    ) {
        return 90;
    }

    /* Africa / Asia tournaments */
    if (
        lower.includes("africa cup") ||
        lower.includes("african cup")
    ) {
        return 90;
    }

    if (
        lower.includes("asian cup") ||
        lower.includes("afc asian")
    ) {
        return 90;
    }

    if (
        lower.includes("afc champions")
    ) {
        return 86;
    }

    /* Morocco */
    if (
        lower.includes("botola") ||
        lower.includes("moroccan")
    ) {
        return 84;
    }

    /* Egypt */
    if (
        lower.includes("egypt")
    ) {
        return 82;
    }

    /* Qatar */
    if (
        lower.includes("qatar")
    ) {
        return 80;
    }

    /* UAE */
    if (
        lower.includes("uae") ||
        lower.includes("emirates")
    ) {
        return 78;
    }

    /* Iraq */
    if (
        lower.includes("iraq") ||
        lower.includes("iraqi")
    ) {
        return 76;
    }

    /* Kuwait */
    if (
        lower.includes("kuwait")
    ) {
        return 74;
    }

    /* Tunisia */
    if (
        lower.includes("tunis")
    ) {
        return 72;
    }

    /* Algeria */
    if (
        lower.includes("alger")
    ) {
        return 70;
    }

    /* Other */
    return 20;
}

/* =========================
   Date
========================= */

function getDate() {

    return new Date()
        .toISOString()
        .slice(0, 10);

}

/* =========================
   Status
========================= */

function getStatus(event) {

    const status =
        String(
            event?.strStatus || ""
        ).toUpperCase();

    const progress =
        String(
            event?.strProgress || ""
        ).toUpperCase();

    if (
        [
            "LIVE",
            "1H",
            "2H",
            "ET",
            "P"
        ].includes(status)
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
        [
            "FT",
            "FINAL",
            "AET",
            "PEN"
        ].includes(status) ||
        progress === "FINAL"
    ) {
        return "FT";
    }

    return "NS";
}

/* =========================
   Timestamp
========================= */

function buildTimestamp(event) {

    /*
     * TheSportsDB may provide:
     *
     * strTimestamp
     *
     * or only:
     *
     * dateEvent + strEventTime
     */

    if (event?.strTimestamp) {

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

    const date =
        event?.dateEvent;

    const time =
        event?.strEventTime;

    if (
        date &&
        time &&
        /^\d{2}:\d{2}(:\d{2})?$/.test(
            String(time)
        )
    ) {

        const normalizedTime =
            String(time).length === 5
                ? `${time}:00`
                : String(time);

        /*
         * TheSportsDB football event time
         * is treated as UTC when no explicit
         * offset is supplied.
         */

        const timestamp =
            `${date}T${normalizedTime}Z`;

        const parsed =
            new Date(timestamp);

        if (
            !Number.isNaN(
                parsed.getTime()
            )
        ) {
            return parsed.toISOString();
        }
    }

    return "";
}

/* =========================
   Normalize
========================= */

function normalize(
    event,
    source
) {

    const timestamp =
        buildTimestamp(event);

    return {

        fixture: {

            id:
                event?.idEvent ||
                event?.idLiveScore ||
                `${event?.idHomeTeam || ""}-${event?.idAwayTeam || ""}-${event?.dateEvent || ""}`,

            date:
                event?.dateEvent ||
                "",

            /*
             * Timestamp is now the
             * preferred time value.
             */

            time:
                timestamp ||
                event?.strEventTime ||
                "",

            timestamp,

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
   Events Day
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

        if (
            Array.isArray(body)
        ) {
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

        const key =
            String(id);

        const old =
            map.get(key);

        if (!old) {

            map.set(
                key,
                event
            );

            continue;
        }

        const oldStatus =
            getStatus(old);

        const newStatus =
            getStatus(event);

        /*
         * Prefer live data when
         * it has live status.
         */

        if (
            newStatus === "LIVE" ||
            newStatus === "HT"
        ) {

            map.set(
                key,
                event
            );

        } else if (
            oldStatus === "NS"
        ) {

            map.set(
                key,
                event
            );

        }

    }

    return [
        ...map.values()
    ];
}

/* =========================
   Match Time For Sorting
========================= */

function getMatchSortTime(match) {

    const timestamp =
        match?.fixture?.timestamp;

    if (timestamp) {

        const value =
            new Date(timestamp)
                .getTime();

        if (
            !Number.isNaN(value)
        ) {
            return value;
        }
    }

    const date =
        String(
            match?.fixture?.date ||
            ""
        );

    const time =
        String(
            match?.fixture?.time ||
            ""
        );

    const cleanTime =
        time
            .replace("T", " ")
            .replace("Z", "")
            .slice(0, 8);

    const parsed =
        new Date(
            `${date}T${cleanTime || "00:00:00"}Z`
        ).getTime();

    return Number.isNaN(parsed)
        ? Number.MAX_SAFE_INTEGER
        : parsed;
}

/* =========================
   Sort
========================= */

function sortMatches(matches) {

    return matches.sort(
        (a, b) => {

            /*
             * IMPORTANT:
             *
             * League importance comes FIRST.
             *
             * This prevents a random live match
             * from a low-priority league from
             * appearing above an important league.
             */

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

            /*
             * Within the same priority:
             * Live first.
             */

            const aLive =
                [
                    "LIVE",
                    "HT"
                ].includes(
                    a.fixture.status.short
                );

            const bLive =
                [
                    "LIVE",
                    "HT"
                ].includes(
                    b.fixture.status.short
                );

            if (
                aLive !==
                bLive
            ) {

                return bLive
                    ? 1
                    : -1;

            }

            /*
             * Then chronological order.
             */

            return (
                getMatchSortTime(a) -
                getMatchSortTime(b)
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
        await fetchEventsDay(
            date
        );

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

    /*
     * Remove duplicate matches.
     */

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

    matches =
        [
            ...unique.values()
        ];

    /*
     * Important:
     * sort AFTER normalization.
     */

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
    async (
        req,
        res
    ) => {

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
                await getMatches(
                    date
                );

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
                    new Date()
                        .toISOString()

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
    async (
        req,
        res
    ) => {

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
                new Date()
                    .toISOString()

        });

    }
);

/* =========================
   Debug Time
========================= */

app.get(
    "/api/debug/time",
    async (
        req,
        res
    ) => {

        const date =
            req.query.date ||
            getDate();

        try {

            const events =
                await fetchEventsDay(
                    date
                );

            const sample =
                events
                    .slice(0, 20)
                    .map(
                        event => ({
                            id:
                                event?.idEvent ||
                                "",

                            event:
                                event?.strEvent ||
                                "",

                            date:
                                event?.dateEvent ||
                                "",

                            originalTime:
                                event?.strEventTime ||
                                "",

                            originalTimestamp:
                                event?.strTimestamp ||
                                "",

                            normalizedTimestamp:
                                buildTimestamp(
                                    event
                                )
                        })
                    );

            res.json({

                date,

                count:
                    events.length,

                sample,

                serverUTC:
                    new Date()
                        .toISOString()

            });

        } catch (error) {

            res.status(500).json({

                error:
                    error.message

            });

        }

    }
);

/* =========================
   Health
========================= */

app.get(
    "/api/health",
    (
        req,
        res
    ) => {

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
                new Date()
                    .toISOString()

        });

    }
);

/* =========================
   Frontend
========================= */

app.get(
    "/",
    (
        req,
        res
    ) => {

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
    (
        req,
        res
    ) => {

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
