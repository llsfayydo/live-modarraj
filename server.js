import express from "express";
import http from "http";
import { Server } from "socket.io";
import axios from "axios";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

/* =========================
   CORS
========================= */

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
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

/* =========================
   STATIC FILES
========================= */

app.use(express.static(__dirname));

/* =========================
   CONFIG
========================= */

const API_KEY = process.env.THESPORTSDB_API_KEY;

const PORT = process.env.PORT || 5000;

const CACHE_TTL = 60 * 1000;

/*
  لا MongoDB.
  التخزين المؤقت في ذاكرة السيرفر فقط.
*/

const memoryCache = new Map();

/* =========================
   HELPERS
========================= */

function normalizeDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("صيغة التاريخ يجب أن تكون YYYY-MM-DD");
  }

  const [year, month, day] = date.split("-");

  return `${day}.${month}.${year}`;
}

/* =========================
   LIVE STATUS
========================= */

function isLiveStatus(status = "", progress = "") {
  const s = String(status).toUpperCase().trim();
  const p = String(progress).toUpperCase().trim();

  const liveStatuses = [
    "1H",
    "2H",
    "HT",
    "ET",
    "P1",
    "P2",
    "P3",
    "OT",
    "PT",
    "BT",
    "S1",
    "S2",
    "S3",
    "S4",
    "S5"
  ];

  if (liveStatuses.includes(s)) {
    return true;
  }

  return /\b(IN PLAY|LIVE|HALF TIME|1ST HALF|2ND HALF)\b/.test(
    `${s} ${p}`
  );
}

/* =========================
   STATUS NORMALIZATION
========================= */

function normalizeStatus(event) {
  const raw = String(event?.strStatus || "").trim();

  const progress = String(
    event?.strProgress || ""
  ).trim();

  if (isLiveStatus(raw, progress)) {
    return raw || "LIVE";
  }

  if (/half\s*time/i.test(raw)) {
    return "HT";
  }

  if (
    /final|finished|after penalties|after extra time/i.test(raw)
  ) {
    return "FT";
  }

  if (/postponed/i.test(raw)) {
    return "POST";
  }

  if (/cancel/i.test(raw)) {
    return "CANC";
  }

  if (/not started/i.test(raw)) {
    return "NS";
  }

  return raw || "NS";
}

/* =========================
   SCORE
========================= */

function toScore(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const n = Number.parseInt(value, 10);

  return Number.isFinite(n) ? n : 0;
}

/* =========================
   EVENT → MATCH
========================= */

function eventToMatch(event, index = 0) {
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
        event?.idEvent ||
        `match-${index}`,

      date: date
        ? `${date}T${time}`
        : new Date().toISOString(),

      status: {
        short: normalizeStatus(event),

        elapsed:
          event?.strProgress || ""
      }
    },

    league: {
      id:
        event?.idLeague || "",

      name:
        event?.strLeague ||
        "بطولة غير محددة",

      country:
        event?.strCountry || ""
    },

    teams: {
      home: {
        name:
          event?.strHomeTeam ||
          "فريق غير معروف",

        logo:
          event?.strHomeTeamBadge ||
          ""
      },

      away: {
        name:
          event?.strAwayTeam ||
          "فريق غير معروف",

        logo:
          event?.strAwayTeamBadge ||
          ""
      }
    },

    goals: {
      home:
        toScore(event?.intHomeScore),

      away:
        toScore(event?.intAwayScore)
    },

    media: {
      channel:
        event?.strTVStation || "",

      commentator:
        event?.strCommentator || ""
    },

    venue:
      event?.strVenue || "",

    city:
      event?.strCity || "",

    priority:
      Number(event?.intRound) || 0,

    source:
      "TheSportsDB"
  };
}

/* =========================
   REMOVE DUPLICATES
========================= */

function dedupeEvents(events) {
  const map = new Map();

  for (const event of events) {
    const id = event?.idEvent;

    if (!id) {
      continue;
    }

    if (!map.has(String(id))) {
      map.set(String(id), event);
    }
  }

  return [...map.values()];
}

/* =========================
   CACHE
========================= */

function cacheGet(key) {
  const item = memoryCache.get(key);

  if (!item) {
    return null;
  }

  if (Date.now() >= item.expiresAt) {
    memoryCache.delete(key);

    return null;
  }

  return item.data;
}

function cacheSet(
  key,
  data,
  ttl = CACHE_TTL
) {
  memoryCache.set(key, {
    data,
    expiresAt:
      Date.now() + ttl
  });
}

/* =========================
   THESPORTSDB
   EVENTS DAY
========================= */

async function fetchEventsDay(date) {
  if (!API_KEY) {
    throw new Error(
      "THESPORTSDB_API_KEY غير موجود في Render"
    );
  }

  const formattedDate =
    normalizeDate(date);

  const url =
    `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsday.php?d=${formattedDate}`;

  const response =
    await axios.get(url, {
      timeout: 15000,

      headers: {
        "User-Agent":
          "Live-Modarraj/1.0"
      }
    });

  const results =
    response?.data?.events ||
    response?.data?.results ||
    [];

  return Array.isArray(results)
    ? results.filter(
        event =>
          event?.strHomeTeam &&
          event?.strAwayTeam
      )
    : [];
}

/* =========================
   THESPORTSDB V2 LIVE
========================= */

async function fetchLiveScores() {
  if (!API_KEY) {
    throw new Error(
      "THESPORTSDB_API_KEY غير موجود في Render"
    );
  }

  const url =
    "https://www.thesportsdb.com/api/v2/json/livescore/soccer";

  const response =
    await axios.get(url, {
      timeout: 12000,

      headers: {
        "X-API-KEY": API_KEY,
        "Accept":
          "application/json",
        "User-Agent":
          "Live-Modarraj/1.0"
      }
    });

  const results =
    response?.data?.livescores ||
    response?.data?.events ||
    response?.data?.data ||
    [];

  return Array.isArray(results)
    ? results
    : [];
}

/* =========================
   MATCHES
========================= */

app.get(
  "/api/matches",
  async (req, res) => {
    const requestedDate =
      typeof req.query.date === "string"
        ? req.query.date
        : new Date()
            .toISOString()
            .slice(0, 10);

    const cacheKey =
      `matches:${requestedDate}`;

    try {
      const cached =
        cacheGet(cacheKey);

      if (cached) {
        return res.json({
          source:
            "Local Memory Cache",

          data: cached,

          count:
            cached.length,

          date:
            requestedDate,

          cached: true,

          timestamp:
            new Date().toISOString()
        });
      }

      console.log(
        `📡 جلب مباريات TheSportsDB: ${requestedDate}`
      );

      const events =
        await fetchEventsDay(
          requestedDate
        );

      const uniqueEvents =
        dedupeEvents(events);

      const matches =
        uniqueEvents.map(
          eventToMatch
        );

      cacheSet(
        cacheKey,
        matches
      );

      io.emit(
        "matchUpdate",
        {
          date:
            requestedDate,

          matches
        }
      );

      console.log(
        `✅ تم جلب ${matches.length} مباراة`
      );

      return res.json({
        source:
          "TheSportsDB API",

        data:
          matches,

        count:
          matches.length,

        date:
          requestedDate,

        cached: false,

        timestamp:
          new Date().toISOString()
      });

    } catch (error) {
      console.error(
        "❌ /api/matches:",
        error.message
      );

      return res.status(502).json({
        source:
          "TheSportsDB API",

        data: [],

        count: 0,

        date:
          requestedDate,

        error:
          error.message,

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
      const live =
        await fetchLiveScores();

      const matches =
        dedupeEvents(live)
          .map(eventToMatch);

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
        "❌ /api/live:",
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

        timestamp:
          new Date().toISOString()
      });
    }
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
        await fetchEventsDay(date);

      return res.json({
        status:
          "success",

        message:
          "اتصال TheSportsDB يعمل",

        date,

        matches:
          events.length,

        api:
          "V1 Events Day + V2 Livescore available",

        timestamp:
          new Date().toISOString()
      });

    } catch (error) {
      return res.status(502).json({
        status:
          "error",

        message:
          "فشل الاتصال بـ TheSportsDB",

        error:
          error.message,

        timestamp:
          new Date().toISOString()
      });
    }
  }
);

/* =========================
   TEST LIVE
========================= */

app.get(
  "/api/test/live",
  async (req, res) => {
    try {
      const live =
        await fetchLiveScores();

      return res.json({
        status:
          "success",

        source:
          "TheSportsDB V2 Livescore",

        matches:
          live.length,

        data:
          live,

        timestamp:
          new Date().toISOString()
      });

    } catch (error) {
      return res.status(502).json({
        status:
          "error",

        source:
          "TheSportsDB V2 Livescore",

        matches: 0,

        data: [],

        error:
          error.message
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
        "disabled - memory cache only",

      apiKey:
        API_KEY
          ? "موجود"
          : "غير موجود",

      nodeVersion:
        process.version,

      environment:
        process.env.NODE_ENV ||
        "production",

      timestamp:
        new Date().toISOString()
    });
  }
);

/* =========================
   FRONTEND
========================= */

app.get(
  "/",
  (req, res) => {

    const candidates = [
      path.join(
        __dirname,
        "index.html"
      ),

      path.join(
        __dirname,
        "live_modarraj_frontend.html"
      )
    ];

    const frontend =
      candidates.find(
        file =>
          fs.existsSync(file)
      );

    if (!frontend) {
      return res.status(500).send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>مدرج لايف</title>
        </head>
        <body>
          <h1>Frontend file not found</h1>
          <p>
            ضع ملف الواجهة باسم
            <b>index.html</b>
            في جذر GitHub.
          </p>
        </body>
        </html>
      `);
    }

    return res.sendFile(
      frontend
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
        "الرابط المطلوب غير موجود",

      path:
        req.path,

      method:
        req.method
    });
  }
);

/* =========================
   SOCKET.IO
========================= */

io.on(
  "connection",
  socket => {

    console.log(
      `🔌 اتصال زائر: ${socket.id}`
    );

    socket.on(
      "disconnect",
      () => {
        console.log(
          `🔌 خروج زائر: ${socket.id}`
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
      "=============================================="
    );

    console.log(
      `🚀 Live Modarraj يعمل على المنفذ ${PORT}`
    );

    console.log(
      "🗄️ MongoDB: غير مستخدمة"
    );

    console.log(
      "💾 Cache: ذاكرة السيرفر فقط"
    );

    console.log(
      `📊 Matches: /api/matches?date=YYYY-MM-DD`
    );

    console.log(
      "🔴 Live: /api/live"
    );

    console.log(
      "🧪 Test: /api/test"
    );

    console.log(
      "=============================================="
    );
  }
);

/* =========================
   ERROR EVENTS
========================= */

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
