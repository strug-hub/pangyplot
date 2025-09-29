# ------------------------------
# Run from the root of the project
# ------------------------------

# 1. Extract all strings into a .pot template
pybabel extract -F babel.cfg -o pangyplot/translations/messages.pot .

# 2. (ONLY run once per language the first time you add it!)
# This creates the initial .po files in translations/<lang>/LC_MESSAGES/messages.po
# pybabel init -i pangyplot/translations/messages.pot -d pangyplot/translations -l en
# pybabel init -i pangyplot/translations/messages.pot -d pangyplot/translations -l fr
# pybabel init -i pangyplot/translations/messages.pot -d pangyplot/translations -l es
# pybabel init -i pangyplot/translations/messages.pot -d pangyplot/translations -l de
# pybabel init -i pangyplot/translations/messages.pot -d pangyplot/translations -l it
# pybabel init -i pangyplot/translations/messages.pot -d pangyplot/translations -l pt_BR
# pybabel init -i pangyplot/translations/messages.pot -d pangyplot/translations -l ru
# pybabel init -i pangyplot/translations/messages.pot -d pangyplot/translations -l zh_CN
# pybabel init -i pangyplot/translations/messages.pot -d pangyplot/translations -l ja
# pybabel init -i pangyplot/translations/messages.pot -d pangyplot/translations -l ko
# pybabel init -i pangyplot/translations/messages.pot -d pangyplot/translations -l ar

# 3. For subsequent updates (after you change templates or add new strings)
pybabel update -i pangyplot/translations/messages.pot -d pangyplot/translations

# 4. After editing the .po files to add translations,
# compile them into .mo files for Flask-Babel to load
pybabel compile -d pangyplot/translations
