-- Visitors to each customer site (api/traffic.js), counted without cookies:
-- the loader sends one beacon per page view, and a visitor is a hash of the
-- day's salt, the site, the address and the browser. Each day's salt is deleted
-- once the day is over, so a hash cannot be traced back or joined across days.
CREATE TABLE traffic_salts (
  day   date PRIMARY KEY,
  salt  bytea NOT NULL
);

CREATE TABLE traffic_hits (
  site_id   uuid NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  day       date NOT NULL,
  at        timestamptz NOT NULL DEFAULT now(),
  path      text NOT NULL,
  referrer  text,            -- the referring host, only when it is another site
  device    text NOT NULL,   -- phone, tablet or desktop, from the viewport width
  visitor   text NOT NULL    -- 16 hex characters of the day's hash
);
CREATE INDEX traffic_hits_site_day ON traffic_hits (site_id, day);
