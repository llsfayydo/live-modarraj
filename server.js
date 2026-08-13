import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;
const API_KEY = process.env.THESPORTSDB_API_KEY;

const cache = new Map();
const CACHE_TTL = 60 * 1000;

app.use(express.json());

/* =========================
   CORS
========================= */

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
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

/* =========================
   STATIC
========================= */

app.use(express.static(__dirname));

/* =========================
   CONFIG
========================= */

if (!API_KEY) {
  console.error(
    "❌ THESPORTSDB_API_KEY غير موجود"
  );
} else {
  console.log(
    "✅ THESPORTSDB_API_KEY موجود"
  );
}

/* =========================
   CACHE
========================= */

function getCache(key) {
  const item = cache.get(key);

  if (!item) return null;

  if (Date.now() > item.expires) {
    cache.delete(key);
    return null;
  }

  return item.data;
}

function setCache(key, data) {
  cache.set(key, {
    data,
    expires: Date.now() + CACHE_TTL
  });
}

/* =========================
   DATE
========================= */

function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(
      "التاريخ يجب أن يكون YYYY-MM-DD"
    );
  }

  return date;
}

/* =========================
   THE SPORT DB V1
========================= */

async function getEventsDay(date) {

  if (!API_KEY) {
    throw new Error(
      "THESPORTSDB_API_KEY غير موجود في Render"
    );
  }

  const cleanDate = validDate(date);

  const url =
    `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsday.php?d=${cleanDate}`;

  console.log(
    `📡 TheSportsDB Schedule: ${cleanDate}`
  );

  const response = await axios.get(url, {
    timeout: 20000,
    headers: {
      Accept: "application/json",
      "User-Agent": "Live-Modarraj/1.0"
    }
  });

  const body = response.data;

  /*
    TheSportsDB V1 Schedule Day:
    events: [...]
  */

  if (Array.isArray(body?.events)) {
    return body.events;
  }

  /*
    دعم احتياطي لأي شكل قديم
  */

  if (Array.isArray(body?.results)) {
    return body.results;
  }

  /*
    إذا لم يرجع API أحداثاً،
    لا نعتبرها مشكلة اتصال.
  */

  return [];
}

/* =========================
   V2 LIVE
========================= */

async function getLiveScores() {

  if (!API_KEY) {
    throw new Error(
      "THESPORTSDB_API_KEY غير موجود"
    );
  }

  const url =
    "https://www.thesportsdb.com/api/v2/json/livescore/soccer";

  const response = await axios.get(url, {
    timeout: 15000,
    headers: {
      "X-API-KEY": API_KEY,
      Accept: "application/json",
      "User-Agent": "Live-Modarraj/1.0"
    }
  });

  const body = response.data;

  if (Array.isArray(body?.livescores)) {
    return body.livescores;
  }

  if (Array.isArray(body?.events)) {
    return body.events;
  }

  if (Array.isArray(body?.data)) {
    return body.data;
  }

  return [];
}

/* =========================
   LIVE CHECK
========================= */

function isLive(event) {

  const status =
    String(event?.strStatus || "")
      .toUpperCase();

  const progress =
    String(event?.strProgress || "")
      .toUpperCase();

  if (
    [
      "LIVE",
      "1H",
      "2H",
      "HT",
      "ET",
      "OT",
      "P",
      "BT"
    ].includes(status)
  ) {
    return true;
  }

  return (
    progress.includes("LIVE") ||
    progress.includes("1ST") ||
    progress.includes("2ND")
  );
}

/* =========================
   STATUS
========================= */

function normalizeStatus(event) {

  if (isLive(event)) {
    return (
      event?.strStatus ||
      "LIVE"
    );
  }

  const status =
    String(event?.strStatus || "")
      .toLowerCase();

  if (
    status.includes("finished") ||
    status.includes("final")
  ) {
    return "FT";
  }

  if (
    status.includes("half")
  ) {
    return "HT";
  }

  if (
    status.includes("postponed")
  ) {
    return "POST";
  }

  if (
    status.includes("cancel")
  ) {
    return "CANC";
  }

  return (
    event?.strStatus ||
    "NS"
  );
}

/* =========================
   SCORE
========================= */

function numberScore(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n =
    Number.parseInt(value, 10);

  return Number.isFinite(n)
    ? n
    : null;
}

/* =========================
   IMPORTANCE
========================= */

const majorLeagues = [
  "Premier League",
  "English Premier League",
  "La Liga",
  "Bundesliga",
  "Serie A",
  "Ligue 1",
  "UEFA Champions League",
  "Champions League",
  "UEFA Europa League",
  "Europa League",
  "Saudi Professional League",
  "Saudi Pro League",
  "Saudi King's Cup",
  "King Cup",
  "AFC Champions League",
  "FIFA World Cup",
  "World Cup",
  "Copa Libertadores"
];

const majorTeams = [
  "Real Madrid",
  "Barcelona",
  "Manchester City",
  "Manchester United",
  "Liverpool",
  "Arsenal",
  "Chelsea",
  "Bayern Munich",
  "Borussia Dortmund",
  "Paris Saint-Germain",
  "Inter Milan",
  "AC Milan",
  "Juventus",
  "Al Hilal",
  "Al-Hilal",
  "Al Nassr",
  "Al-Nassr",
  "Al Ittihad",
  "Al-Ittihad",
  "Al Ahly",
  "Zamalek"
];

function importance(event) {

  let value = 0;

  const league =
    String(event?.strLeague || "");

  const home =
    String(event?.strHomeTeam || "")
      .toLowerCase();

  const away =
    String(event?.strAwayTeam || "")
      .toLowerCase();

  const leagueLower =
    league.toLowerCase();

  for (const major of majorLeagues) {

    if (
      leagueLower.includes(
        major.toLowerCase()
      )
    ) {
      value += 100;
      break;
    }
  }

  let bigTeams = 0;

  for (const team of majorTeams) {

    const t =
      team.toLowerCase();

    if (home.includes(t)) {
      value += 30;
      bigTeams++;
    }

    if (away.includes(t)) {
      value += 30;
      bigTeams++;
    }
  }

  if (bigTeams >= 2) {
    value += 50;
  }

  /*
    المباراة المباشرة دائماً فوق
  */

  if (isLive(event)) {
    value += 10000;
  }

  return value;
}

/* =========================
   EVENT NORMALIZER
========================= */

function normalizeEvent(event) {

  const date =
    event?.dateEventLocal ||
    event?.dateEvent ||
    "";

  const time =
    event?.strTimeLocal ||
    event?.strTime ||
    "00:00:00";

  return {

    fixture: {

      id:
        String(
          event?.idEvent ||
          ""
        ),

      date:
        date
          ? `${date}T${time}`
          : event?.strTimestamp ||
            "",

      status: {

        short:
          normalizeStatus(event),

        elapsed:
          event?.strProgress ||
          null
      }
    },

    league: {

      id:
        String(
          event?.idLeague ||
          ""
        ),

      name:
        event?.strLeague ||
        "غير محددة",

      country:
        event?.strCountry ||
        "",

      badge:
        event?.strLeagueBadge ||
        ""
    },

    teams: {

      home: {

        id:
          String(
            event?.idHomeTeam ||
            ""
          ),

        name:
          event?.strHomeTeam ||
          "",

        logo:
          event?.strHomeTeamBadge ||
          ""
      },

      away: {

        id:
          String(
            event?.idAwayTeam ||
            ""
          ),

        name:
          event?.strAwayTeam ||
          "",

        logo:
          event?.strAwayTeamBadge ||
          ""
      }
    },

    goals: {

      home:
        numberScore(
          event?.intHomeScore
        ),

      away:
        numberScore(
          event?.intAwayScore
        )
    },

    venue:
      event?.strVenue ||
      "",

    country:
      event?.strCountry ||
      "",

    tv:
      event?.strTVStation ||
      "",

    priority:
      importance(event),

    source:
      "TheSportsDB"
  };
}

/* =========================
   DEDUPLICATE
========================= */

function uniqueEvents(events) {

  const map = new Map();

  for (const event of events) {

    const id =
      event?.idEvent;

    if (!id) continue;

    if (!map.has(String(id))) {
      map.set(
        String(id),
        event
      );
    }
  }

  return [...map.values()];
}

/* =========================
   MATCHES
========================= */

app.get(
  "/api/matches",
  async (req, res) => {

    const date =
      typeof req.query.date === "string"
        ? req.query.date
        : new Date()
            .toISOString()
            .slice(0, 10);

    const key =
      `matches:${date}`;

    try {

      const cached =
        getCache(key);

      if (cached) {

        return res.json({

          source:
            "TheSportsDB API",

          data:
            cached,

          count:
            cached.length,

          date,

          cached:
            true,

          timestamp:
            new Date().toISOString()
        });
      }

      const events =
        await getEventsDay(date);

      const cleaned =
        uniqueEvents(events);

      const matches =
        cleaned.map(
          normalizeEvent
        );

      /*
        الأهم أولاً
      */

      matches.sort(
        (a, b) => {

          if (
            b.priority !==
            a.priority
          ) {
            return (
              b.priority -
              a.priority
            );
          }

          return (
            String(
              a.fixture.date
            ).localeCompare(
              String(
                b.fixture.date
              )
            )
          );
        }
      );

      setCache(
        key,
        matches
      );

      io.emit(
        "matchUpdate",
        {
          date,
          matches
        }
      );

      return res.json({

        source:
          "TheSportsDB API",

        data:
          matches,

        count:
          matches.length,

        date,

        cached:
          false,

        timestamp:
          new Date().toISOString()
      });

    } catch (error) {

      console.error(
        "❌ MATCHES ERROR:",
        error.message
      );

      console.error(
        "HTTP STATUS:",
        error.response?.status
      );

      console.error(
        "THE SPORTS DB RESPONSE:",
        error.response?.data
      );

      return res.status(502).json({

        source:
          "TheSportsDB API",

        data: [],

        count: 0,

        date,

        error:
          error.message,

        upstreamStatus:
          error.response?.status ||
          null,

        upstream:
          error.response?.data ||
          null,

        timestamp:
          new Date().toISOString()
      });
    }
  }
);

/* =========================
   LIVE
========================= */

app.get(
  "/api/live",
  async (req, res) => {

    try {

      const events =
        await getLiveScores();

      const matches =
        uniqueEvents(events)
          .map(
            normalizeEvent
          );

      matches.sort(
        (a, b) =>
          b.priority -
          a.priority
      );

      return res.json({

        status:
          "success",

        source:
          "TheSportsDB V2 Livescore",

        matches:
          matches.length,

        data:
          matches,

        timestamp:
          new Date().toISOString()
      });

    } catch (error) {

      console.error(
        "❌ LIVE ERROR:",
        error.message
      );

      return res.status(502).json({

        status:
          "error",

        source:
          "TheSportsDB V2 Livescore",

        matches: 0,

        data: [],

        error:
          error.message,

        upstreamStatus:
          error.response?.status ||
          null,

        upstream:
          error.response?.data ||
          null
      });
    }
  }
);

/* =========================
   HEALTH
========================= */

app.get(
  "/api/health",
  (req, res) => {

    res.json({

      status:
        "ok",

      server:
        "Live Modarraj",

      database:
        "disabled",

      cache:
        "memory",

      theSportsDB:
        API_KEY
          ? "connected"
          : "missing",

      timestamp:
        new Date().toISOString()
    });
  }
);

/* =========================
   TEST
========================= */

app.get(
  "/api/test",
  async (req, res) => {

    const date =
      new Date()
        .toISOString()
        .slice(0, 10);

    try {

      const events =
        await getEventsDay(
          date
        );

      return res.json({

        status:
          "success",

        source:
          "TheSportsDB Schedule Day",

        date,

        events:
          events.length,

        timestamp:
          new Date().toISOString()
      });

    } catch (error) {

      return res.status(502).json({

        status:
          "error",

        error:
          error.message,

        upstreamStatus:
          error.response?.status ||
          null,

        upstream:
          error.response?.data ||
          null
      });
    }
  }
);

/* =========================
   FRONTEND
========================= */

app.get(
  "/",
  (req, res) => {

    const index =
      path.join(
        __dirname,
        "index.html"
      );

    if (
      fs.existsSync(index)
    ) {

      return res.sendFile(
        index
      );
    }

    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>مدرج لايف</title>
      </head>
      <body>
        <h1>مدرج لايف</h1>
        <p>
          ملف index.html غير موجود.
        </p>
      </body>
      </html>
    `);
  }
);

/* =========================
   404
========================= */

app.use(
  (req, res) => {

    res.status(404).json({

      error:
        "الرابط المطلوب غير موجود",

      path:
        req.path,

      method:
        req.method
    });
  }
);

/* =========================
   SOCKET
========================= */

io.on(
  "connection",
  socket => {

    console.log(
      `🔌 Connected: ${socket.id}`
    );

    socket.on(
      "disconnect",
      () => {

        console.log(
          `🔌 Disconnected: ${socket.id}`
        );
      }
    );
  }
);

/* =========================
   START
========================= */

server.listen(
  PORT,
  () => {

    console.log(
      "======================================"
    );

    console.log(
      `🚀 Live Modarraj : ${PORT}`
    );

    console.log(
      "🗄️ MongoDB: OFF"
    );

    console.log(
      "💾 Cache: MEMORY"
    );

    console.log(
      "⚽ TheSportsDB: ENABLED"
    );

    console.log(
      "======================================"
    );
  }
);

/* =========================
   PROCESS ERRORS
========================= */

process.on(
  "unhandledRejection",
  error => {

    console.error(
      "Unhandled Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {

    console.error(
      "Uncaught Exception:",
      error
    );
  }
);
