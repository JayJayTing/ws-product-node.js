require('dotenv').config();
const express = require('express');
const pg = require('pg');
const bodyParser = require('body-parser');
const rateLimiter = require('./express_custom_middlewares/rateLimiter');
const bypass = require('./express_custom_middlewares/bypass');
const app = express();
var cors = require('cors');
// configs come from standard PostgreSQL env vars
// https://www.postgresql.org/docs/9.6/static/libpq-envars.html
const pool = new pg.Pool({
  PGHOST: process.env.PGHOST,
  PGPORT: process.env.PGPORT,
  PGDATABASE: process.env.PGDATABASE,
  PGUSER: process.env.PGUSER,
  PGPASSWORD: process.env.PGPASSWORD
});
//req.headers['x-forwarded-for'] || req.connection.remoteAddress;

//middleware that creates an object called bypass in req.
//will be used to determine which middlewares to bypass
app.use(bodyParser.urlencoded());
app.use(bodyParser.json());
app.use(cors());
// app.use(function(req, res, next) {
// 	res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000/');

// 	next();
// });

app.use(bypass);
//middleware that adds limits to number of queries an ip address can perform
app.use(rateLimiter);

const queryHandler = (req, res, next) => {
  //if user limit-rates are met, then this will be bypassed
  if (!req.bypass.queryHandler) {
    pool
      .query(req.sqlQuery, Object.values(req.body))
      .then(r => {
        return res.json(r.rows || []);
      })
      .catch(next);
  } else {
    next();
  }
};

app.get('/', (req, res) => {
  res.send('Welcome to EQ Works 😎');
});

app.get(
  '/events/hourly',
  (req, res, next) => {
    req.sqlQuery = `
    SELECT date, hour, events, public.hourly_events.poi_id
    FROM public.hourly_events
    ORDER BY date, hour
    LIMIT 168;
  `;
    console.log(req.query);
    return next();
  },
  queryHandler
);

app.post(
  '/events/daily',
  (req, res, next) => {
    req.sqlQuery = `
    SELECT date, SUM(events) AS events, poi.name
    FROM public.hourly_events
    JOIN public.poi ON  public.hourly_events.poi_id=public.poi.poi_id
    WHERE public.hourly_events.poi_id = $1
    GROUP BY poi.name, date
    ORDER BY date
    LIMIT 7;
  `;

    return next();
  },
  queryHandler
);

app.get(
  '/stats/hourly',
  (req, res, next) => {
    req.sqlQuery = `
    SELECT date, hour, impressions, clicks, revenue, poi_id
    FROM public.hourly_stats
    ORDER BY date, hour
    LIMIT 168;
  `;
    return next();
  },
  queryHandler
);

app.post(
  '/stats/daily',
  (req, res, next) => {
    req.sqlQuery = `
    SELECT date,
        SUM(impressions) AS impressions,
        SUM(clicks) AS clicks,
        SUM(revenue) AS revenue, public.poi.name
    FROM public.hourly_stats
    JOIN public.poi ON public.hourly_stats.poi_id = public.poi.poi_id
    WHERE public.poi.poi_id = $1
    GROUP BY date, name
    ORDER BY date
    LIMIT 7;
  `;
    return next();
  },
  queryHandler
);

app.get(
  '/poi',
  (req, res, next) => {
    req.sqlQuery = `
    SELECT *
    FROM public.poi;
  `;
    return next();
  },
  queryHandler
);

app.listen(process.env.PORT || 5555, err => {
  if (err) {
    console.error(err);
    process.exit(1);
  } else {
    console.log(`Running on ${process.env.PORT || 5555}`);
  }
});

// last resorts
process.on('uncaughtException', err => {
  console.log(`Caught exception: ${err}`);
  process.exit(1);
});
process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
  process.exit(1);
});
