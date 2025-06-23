import pg from "pg";

export default function overridePgDate() {
	pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
}
