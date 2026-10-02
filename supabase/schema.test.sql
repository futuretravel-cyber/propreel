-- ============================================================================
-- PropReel — schema functional tests
-- ============================================================================
-- Run against any throwaway Postgres AFTER applying schema.sql. These caught
-- two real bugs during the Supabase migration (2026-10): EXECUTE ... USING
-- before INTO (syntax error), and jsonb_set returning NULL when new_value is
-- NULL (missing-attribute increment would have nulled the whole data column).
--
-- Local (Docker):
--   docker run --name pgtest -e POSTGRES_PASSWORD=test -e POSTGRES_DB=propreel \
--     -p 55432:5432 -d postgres:15
--   docker cp supabase/schema.sql pgtest:/tmp/schema.sql
--   docker cp supabase/schema.test.sql pgtest:/tmp/t.sql
--   docker exec pgtest psql -U postgres -d propreel -v ON_ERROR_STOP=1 \
--     -f //tmp/schema.sql -f //tmp/t.sql
--   docker rm -f pgtest
-- ============================================================================

\set ON_ERROR_STOP on

-- ── dec_if_enough ────────────────────────────────────────────────────────────
insert into users (id, data) values ('u1', '{"credits": 100, "email": "t@t.co"}');

select dec_if_enough('users', 'u1', 'credits', 40)  as expect_60;
select dec_if_enough('users', 'u1', 'credits', 100) as expect_null_insufficient;
select dec_if_enough('users', 'u1', 'credits', 60)  as expect_0_boundary;
select dec_if_enough('users', 'u1', 'credits', 1)   as expect_null_empty;
select dec_if_enough('users', 'nope', 'credits', 1) as expect_null_missing_row;

-- ── inc_value (including a row with NO credits attribute — the NULL trap) ───
insert into users (id, data) values ('u2', '{"email": "x@t.co"}');
select inc_value('users', 'u2', 'credits', 25) as expect_25;
select inc_value('users', 'u2', 'credits', 5)  as expect_30;
-- data must be intact (not nulled) and contain the new key
select data->>'email' as expect_email_intact, data->>'credits' as expect_30
from users where id = 'u2';

-- ── claim_lock (idempotency) ─────────────────────────────────────────────────
select claim_lock('evt_test1', '{"probe": true}') as expect_true;
select claim_lock('evt_test1', '{"probe": true}') as expect_false;
select count(*) as expect_1 from settings where id = 'evt_test1';

-- ── numeric fidelity (no float drift) ────────────────────────────────────────
insert into users (id, data) values ('u4', '{"credits": 7}');
select dec_if_enough('users', 'u4', 'credits', 3) as expect_4;
select data->>'credits' as expect_text_4 from users where id = 'u4';

-- ── generated columns follow data writes ────────────────────────────────────
select credits as expect_30_generated_col from users where id = 'u2';
