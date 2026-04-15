import { type CustomDataSource, type Entity, type Viewer } from 'cesium';

interface SyncEntitiesOptions<T> {
    ds: CustomDataSource;
    items: T[];
    getId: (item: T) => string;
    /** Kalt når entity med dette ID-et allerede finnes — mutér properties in-place. */
    onUpdate?: (entity: Entity, item: T) => void;
    /** Kalt når ingen entity finnes — returner ferdig konstruert Entity (med id satt). */
    onCreate: (item: T) => Entity;
    viewer: Viewer | null;
}

/**
 * Synkroniserer en Cesium CustomDataSource med et datasett:
 * oppdaterer eksisterende entities, legger til nye, og fjerner utgåtte.
 * Kaller `viewer.scene.requestRender()` til slutt.
 */
export function syncEntities<T>({
    ds,
    items,
    getId,
    onUpdate,
    onCreate,
    viewer,
}: SyncEntitiesOptions<T>): void {
    const existing = new Map<string, Entity>();
    for (const entity of ds.entities.values) existing.set(entity.id, entity);

    const seen = new Set<string>();
    for (const item of items) {
        const id = getId(item);
        seen.add(id);
        const entity = existing.get(id);
        if (entity) {
            onUpdate?.(entity, item);
        } else {
            const newEntity = onCreate(item);
            ds.entities.add(newEntity);
            existing.set(id, newEntity); // prevent DeveloperError if input has duplicate IDs
        }
    }

    for (const [id] of existing) {
        if (!seen.has(id)) ds.entities.removeById(id);
    }

    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
}
