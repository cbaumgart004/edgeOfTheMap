-- Clicks on links that leave the site (api/traffic.js): booking pages, class
-- schedules, mail and phone links. Counted like page views, without cookies,
-- and never for the site's own members.
CREATE TABLE traffic_clicks (
  site_id   uuid NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  day       date NOT NULL,
  at        timestamptz NOT NULL DEFAULT now(),
  path      text NOT NULL,   -- the page the link was on
  target    text NOT NULL,   -- where it went: host and path, or mailto:/tel:
  label     text,            -- the link's words, with the heading it sat under
  visitor   text NOT NULL
);
CREATE INDEX traffic_clicks_site_day ON traffic_clicks (site_id, day);
