# Bot Patch: REST Laximo client (Variant A)

Copy `src/clients/laximo.js` into your project and set env vars:

LAXIMO_BASE_URL=https://<your-php-service>.up.railway.app
LAXIMO_PATH_FINDVEHICLE=/cat/findVehicle
LAXIMO_PATH_LIST_UNITS=/cat/listUnits
LAXIMO_PATH_LIST_PARTS=/cat/listDetailByUnit
LAXIMO_PATH_PART_BY_OEM=/doc/partByOem
LAXIMO_PATH_CROSSES_BY_OEM=/doc/crosses
LAXIMO_DEFAULT_CATEGORY=0
LAXIMO_DEFAULT_GROUP=1

Then commit & deploy.
