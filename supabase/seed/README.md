# Seed data

`demo.sql` loads clearly labelled **[DEMO]** data for local development and demos only.
It is never loaded automatically (`[db.seed] enabled = false` in `config.toml`) and refuses to
run when `platform_settings.site.environment` is `"production"`. Remove it with `remove-demo.sql`.
