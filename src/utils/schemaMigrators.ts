// Skjelett-migrator-registry for Firestore-historikk.
// Migrasjoner kjører ved LESING, ikke skriving — gamle dokumenter skrives aldri om.
// Registrer nye migrators når schemaVersion økes.

type Migrator<T> = (raw: unknown) => T;

interface MigratorRegistry<T> {
    current: number;
    migrators: Record<number, Migrator<T>>;
    migrate: (raw: unknown) => T | null;
}

function buildRegistry<T>(current: number, migrators: Record<number, Migrator<T>>): MigratorRegistry<T> {
    return {
        current,
        migrators,
        migrate: (raw: unknown): T | null => {
            const version = (raw as { schemaVersion?: number })?.schemaVersion;
            if (version === current) return raw as T;
            if (version && migrators[version]) return migrators[version](raw);
            console.warn('[schemaMigrators] ukjent schemaVersion, hopper over', { version });
            return null;
        },
    };
}

// Snapshot-migratorer (v1 er current — ingen migratorer enda).
export const snapshotMigrators = buildRegistry<unknown>(1, {});

// Gate-migratorer (v1 er current — ingen migratorer enda).
export const gateMigrators = buildRegistry<unknown>(1, {});

// Entity-snapshot-migratorer (v1 er current — ingen migratorer enda).
// Bruker Cloud Function skriver til /entities/{type}/buckets/*.
export const entityMigrators = buildRegistry<unknown>(1, {});
