#!/usr/bin/env bash
# Translation management: extract, update, and compile .po/.mo files.
# Run from pangyplot/translations/

# 1. Extract all strings into a .pot template
pybabel extract -F babel.cfg -o messages.pot ../..

# 2. (ONLY run once per language the first time you add it!)
# pybabel init -i messages.pot -d . -l en
# pybabel init -i messages.pot -d . -l fr
# pybabel init -i messages.pot -d . -l es
# pybabel init -i messages.pot -d . -l de
# pybabel init -i messages.pot -d . -l it
# pybabel init -i messages.pot -d . -l pt_BR
# pybabel init -i messages.pot -d . -l ru
# pybabel init -i messages.pot -d . -l zh_CN
# pybabel init -i messages.pot -d . -l ja
# pybabel init -i messages.pot -d . -l ko
# pybabel init -i messages.pot -d . -l ar

# 3. For subsequent updates (after you change templates or add new strings)
pybabel update -i messages.pot -d .

# 4. After editing the .po files to add translations,
# compile them into .mo files for Flask-Babel to load
pybabel compile -d .
