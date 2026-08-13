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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(__dirname));

/* =========================================================
   CORS
========================================================= */

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

/* =========================================================
   CONFIG
========================================================= */

const PORT = process.env.PORT || 10000;

const API_KEY =
  process.env.THESPORTSDB_API_KEY || "5010468507";

const CACHE_TIME = 60 * 1000;

const localMemoryCache = new Map();

/* =========================================================
   LEAGUES
   ترتيب الأولوية:
   1 - السعودية
   2 - أبطال أوروبا
   3 - الدوريات الأوروبية الكبرى
   4 - مصر
   5 - بطولات أخرى
========================================================= */

const LEAGUES = [
  {
    name: "Saudi Professional League",
    priority: 1000
  },
  {
    name: "UEFA Champions League",
    priority: 950
  },
  {
    name: "English Premier League",
    priority: 900
  },
  {
    name: "La Liga",
    priority: 890
  },
  {
    name: "Serie A",
    priority: 880
  },
  {
    name: "Bundesliga",
    priority: 870
  },
  {
    name: "Ligue 1",
    priority: 860
  },
  {
    name: "Egyptian Premier League",
    priority: 800
  },
  {
    name: "Botola Pro",
    priority: 790
  }
];

/* =========================================================
   BIG TEAMS
========================================================= */

const PRIORITY_TEAMS = [
  "Al Hilal",
  "Al Nassr",
  "Al Ittihad",
  "Al Ahli",
  "Al Shabab",

  "Real Madrid",
  "Barcelona",
  "Atletico Madrid",

  "Manchester City",
  "Manchester United",
  "Liverpool",
  "Arsenal",
  "Chelsea",
  "Tottenham",

  "Bayern Munich",
  "Borussia Dortmund",

  "Paris Saint-Germain",
  "PSG",

  "Juventus",
  "Inter Milan",
  "AC Milan",
  "Napoli",
  "Roma",

  "Ajax",
  "Benfica",
  "Porto"
];

/* =========================================================
   DATE
========================================================= */

function normalizeDate(date) {
  if (!date) {
    return new Date()
      .toISOString()
      .split("T")[0];
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(
      "التاريخ يجب أن يكون بصيغة YYYY-MM-DD"
    );
  }

  return date;
}

/* =========================================================
   STATUS
========================================================= */

function normalizeStatus(event) {
  const status = String(
    event?.strStatus ||
    event?.strProgress ||
    event?.status?.short ||
    ""
  ).toUpperCase();

  if (
    status.includes("HALF") ||
    status === "HT"
  ) {
    return "HT";
  }

  if (
    status.includes("FINAL") ||
    status === "FT"
  ) {
    return "FT";
  }

  if (
    status.includes("NOT STARTED") ||
    status === "NS"
  ) {
    return "NS";
  }

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

  return "NS";
}

/* =========================================================
   PRIORITY
========================================================= */

function getMatchPriority(event, leaguePriority = 50) {
  let score = Number(leaguePriority) || 50;

  const home = String(
    event?.strHomeTeam || ""
  ).toLowerCase();

  const away = String(
    event?.strAwayTeam || ""
  ).toLowerCase();

  for (const team of PRIORITY_TEAMS) {
    const t = team.toLowerCase();

    if (home.includes(t)) {
      score += 100;
    }

    if (away.includes(t)) {
      score += 100;
    }
  }

  const status = normalizeStatus(event);

  if (
    status === "LIVE" ||
    status === "HT"
  ) {
    score += 10000;
  }

  return score;
}

/* =========================================================
   FETCH EVENTS DAY
========================================================= */

async function fetchEventsDay(date) {
  const allEvents = [];

  for (const league of LEAGUES) {
    try {
      const url =
        `https://www.thesportsdb.com/api/v1/json/` +
        `${API_KEY}/eventsday.php?d=${date}` +
        `&l=${encodeURIComponent(league.name)}`;

      console.log(
        `📡 ${league.name} - ${date}`
      );

      const response = await axios.get(
        url,
        {
          timeout: 15000,
          headers: {
            "User-Agent":
              "Live-Modarraj/1.0"
          }
        }
      );

      const results =
        response?.data?.events ||
        response?.data?.results ||
        [];

      const events = Array.isArray(results)
        ? results
        : [results];

      const validEvents = events
        .filter(
          event =>
            event &&
            event.strHomeTeam &&
            event.strAwayTeam
        )
        .map(event => ({
          ...event,
          _leaguePriority:
            league.priority
        }));

      console.log(
        `   ✅ ${validEvents.length} مباراة`
      );

      allEvents.push(...validEvents);

    } catch (error) {
      console.log(
        `   ⚠️ ${league.name}: ${error.message}`
      );
    }
  }

  return allEvents;
}

/* =========================================================
   V2 LIVESCORE
========================================================= */

async function fetchLiveScores() {
  try {
    const urls = [
      `https://www.thesportsdb.com/api/v2/json/livescore/${API_KEY}`,
      `https://www.thesportsdb.com/api/v2/json/livescore`
    ];

    for (const url of urls) {
      try {
        const response = await axios.get(
          url,
          {
            timeout: 15000,
            headers: {
              "X-API-KEY": API_KEY,
              "User-Agent":
                "Live-Modarraj/1.0"
            }
          }
        );

        const data =
          response?.data?.data ||
          response?.data?.events ||
          response?.data?.livescores ||
          response?.data?.results ||
          [];

        if (Array.isArray(data)) {
          return data;
        }
      } catch {
        continue;
      }
    }

    return [];

  } catch (error) {
    console.log(
      "⚠️ Livescore:",
      error.message
    );

    return [];
  }
}

/* =========================================================
   MERGE
========================================================= */

function mergeEvents(arrays) {
  const map = new Map();

  for (const events of arrays) {
    for (const event of events || []) {
      if (!event) {
        continue;
      }

      const id =
        event.idEvent ||
        event.idLiveScore ||
        event.fixture?.id ||
        `${event.idHomeTeam}-${event.idAwayTeam}-${event.dateEvent}`;

      if (!id) {
        continue;
      }

      const existing = map.get(id);

      if (!existing) {
        map.set(id, event);
        continue;
      }

      const currentStatus =
        normalizeStatus(event);

      if (
        currentStatus === "LIVE" ||
        currentStatus === "HT"
      ) {
        map.set(id, event);
      }
    }
  }

  return Array.from(map.values());
}

/* =========================================================
   NORMALIZE EVENT
========================================================= */

function normalizeEvent(event) {
  const status =
    normalizeStatus(event);

  const homeScore =
    Number.parseInt(
      event?.intHomeScore ??
      event?.goals?.home ??
      0,
      10
    ) || 0;

  const awayScore =
    Number.parseInt(
      event?.intAwayScore ??
      event?.goals?.away ??
      0,
      10
    ) || 0;

  const channel = String(
    event?.strTVStation ||
    event?.media?.channel ||
    ""
  ).trim();

  const commentator = String(
    event?.strCommentator ||
    event?.media?.commentator ||
    ""
  ).trim();

  const media = {};

  /*
     القناة تظهر فقط إذا كانت موجودة فعليًا.
     لا يوجد SSC / beIN افتراضي.
  */

  if (channel) {
    media.channel = channel;
  }

  if (commentator) {
    media.commentator = commentator;
  }

  const date =
    event?.dateEvent
      ? `${event.dateEvent}T${
          event.strTime ||
          "00:00:00"
        }`
      : event?.fixture?.date ||
        new Date().toISOString();

  const priority =
    getMatchPriority(
      event,
      event?._leaguePriority || 50
    );

  return {
    fixture: {
      id:
        event?.idEvent ||
        event?.idLiveScore ||
        event?.fixture?.id,

      date,

      status: {
        short: status,

        elapsed:
          event?.strProgress ||
          event?.status?.elapsed ||
          ""
      }
    },

    league: {
      name:
        event?.strLeague ||
        event?.league?.name ||
        "بطولات أخرى"
    },

    teams: {
      home: {
        name:
          event?.strHomeTeam ||
          event?.teams?.home?.name ||
          "فريق غير معروف",

        logo:
          event?.strHomeTeamBadge ||
          event?.teams?.home?.logo ||
          "https://www.thesportsdb.com/images/media/team/badge/default.png"
      },

      away: {
        name:
          event?.strAwayTeam ||
          event?.teams?.away?.name ||
          "فريق غير معروف",

        logo:
          event?.strAwayTeamBadge ||
          event?.teams?.away?.logo ||
          "https://www.thesportsdb.com/images/media/team/badge/default.png"
      }
    },

    goals: {
      home: homeScore,
      away: awayScore
    },

    media,

    priority
  };
}

/* =========================================================
   SORT
========================================================= */

function sortMatches(matches) {
  return matches.sort((a, b) => {

    const liveA =
      ["LIVE", "HT"].includes(
        a.fixture?.status?.short
      )
        ? 1
        : 0;

    const liveB =
      ["LIVE", "HT"].includes(
        b.fixture?.status?.short
      )
        ? 1
        : 0;

    if (liveA !== liveB) {
      return liveB - liveA;
    }

    if (
      Number(b.priority || 0) !==
      Number(a.priority || 0)
    ) {
      return (
        Number(b.priority || 0) -
        Number(a.priority || 0)
      );
    }

    return (
      new Date(a.fixture.date) -
      new Date(b.fixture.date)
    );
  });
}

/* =========================================================
   GET MATCHES
========================================================= */

async function getMatches(date) {

  const cacheKey =
    `matches:${date}`;

  const cached =
    localMemoryCache.get(cacheKey);

  if (
    cached &&
    Date.now() < cached.expiresAt
  ) {
    return {
      data: cached.data,
      cached: true
    };
  }

  const dayEvents =
    await fetchEventsDay(date);

  const liveEvents =
    await fetchLiveScores();

  const today =
    new Date()
      .toISOString()
      .split("T")[0];

  const filteredLive =
    date === today
      ? liveEvents
      : [];

  const rawEvents =
    mergeEvents([
      dayEvents,
      filteredLive
    ]);

  let matches =
    rawEvents.map(normalizeEvent);

  matches =
    Array.from(
      new Map(
        matches.map(match => [
          match.fixture.id,
          match
        ])
      ).values()
    );

  matches =
    sortMatches(matches);

  localMemoryCache.set(
    cacheKey,
    {
      data: matches,
      expiresAt:
        Date.now() + CACHE_TIME
    }
  );

  return {
    data: matches,
    cached: false
  };
}

/* =========================================================
   API MATCHES
========================================================= */

app.get(
  "/api/matches",
  async (req, res) => {

    try {

      const requestedDate =
        normalizeDate(
          req.query.date
        );

      const result =
        await getMatches(
          requestedDate
        );

      io.emit(
        "matchUpdate",
        {
          date: requestedDate,
          matches: result.data
        }
      );

      return res.json({
        source:
          result.cached
            ? "Local Memory Cache"
            : "TheSportsDB API",

        data: result.data,

        count:
          result.data.length,

        date:
          requestedDate,

        cached:
          result.cached,

        timestamp:
          new Date().toISOString()
      });

    } catch (error) {

      console.error(
        "❌ /api/matches:",
        error.message
      );

      return res.status(500).json({
        source: "Server Error",
        data: [],
        count: 0,
        error: error.message,
        timestamp:
          new Date().toISOString()
      });
    }
  }
);

/* =========================================================
   API TEST
========================================================= */

app.get(
  "/api/test",
  async (req, res) => {

    const date =
      new Date()
        .toISOString()
        .split("T")[0];

    try {

      const day =
        await fetchEventsDay(date);

      const live =
        await fetchLiveScores();

      return res.json({
        status: "success",
        message:
          "اتصال TheSportsDB يعمل",
        date,
        eventsDay:
          day.length,
        liveScores:
          live.length,
        api:
          "V1 Events Day + V2 Livescore available",
        timestamp:
          new Date().toISOString()
      });

    } catch (error) {

      return res.status(500).json({
        status: "error",
        error: error.message,
        timestamp:
          new Date().toISOString()
      });
    }
  }
);

/* =========================================================
   LIVE TEST
========================================================= */

app.get(
  "/api/test/live",
  async (req, res) => {

    try {

      const live =
        await fetchLiveScores();

      return res.json({
        status: "success",
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
        status: "error",
        error: error.message
      });
    }
  }
);

/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/api/health",
  (req, res) => {

    res.json({
      status: "ok",
      server: "Live Modarraj",

      database:
        "disabled - memory cache only",

      apiKey:
        API_KEY
          ? "موجود"
          : "غير موجود",

      cache:
        "memory",

      theSportsDB:
        "enabled",

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

/* =========================================================
   FRONTEND
========================================================= */

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

/* =========================================================
   FAVICON
========================================================= */

app.get(
  "/favicon.ico",
  (req, res) => {
    res.status(204).end();
  }
);

/* =========================================================
   404
========================================================= */

app.use(
  (req, res) => {

    res.status(404).json({
      error:
        "الرابط المطلوب غير موجود",
      path: req.path,
      method: req.method
    });
  }
);

/* =========================================================
   ERROR
========================================================= */

app.use(
  (err, req, res, next) => {

    console.error(
      "❌ خطأ غير متوقع:",
      err
    );

    res.status(500).json({
      error:
        "حدث خطأ في السيرفر",
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

    console.log("");
    console.log(
      "══════════════════════════════════════"
    );

    console.log(
      `🚀 Live Modarraj يعمل على ${PORT}`
    );

    console.log(
      "💾 Database: OFF"
    );

    console.log(
      "🧠 Cache: MEMORY"
    );

    console.log(
      "⚽ TheSportsDB: ENABLED"
    );

    console.log(
      "══════════════════════════════════════"
    );

    console.log(
      `🌐 Port: ${PORT}`
    );

    console.log(
      "══════════════════════════════════════"
    );
  }
);

/* =========================================================
   PROCESS ERRORS
========================================================= */

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

    process.exit(1);
  }
);
