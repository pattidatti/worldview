import { createContext, useContext, useState, type ReactNode } from 'react';
import { type Ship } from '@/types/ship';

export interface DarkShipRecord {
    mmsi: number;
    name: string;
    flagState: string;
    shipType: number;
    lat: number;
    lon: number;
    lastSeen: number;
    isGhost: boolean;
}

interface DarkShipsContextType {
    darkShips: DarkShipRecord[];
    setDarkShips: (ships: DarkShipRecord[]) => void;
}

const DarkShipsContext = createContext<DarkShipsContextType>({
    darkShips: [],
    setDarkShips: () => {},
});

export function DarkShipsProvider({ children }: { children: ReactNode }) {
    const [darkShips, setDarkShips] = useState<DarkShipRecord[]>([]);
    return (
        <DarkShipsContext.Provider value={{ darkShips, setDarkShips }}>
            {children}
        </DarkShipsContext.Provider>
    );
}

export function useDarkShips() {
    return useContext(DarkShipsContext);
}

export function shipToDarkRecord(ship: Ship, isGhost: boolean, flagState: string): DarkShipRecord {
    return {
        mmsi: ship.mmsi,
        name: ship.name,
        flagState,
        shipType: ship.shipType,
        lat: ship.lat,
        lon: ship.lon,
        lastSeen: ship.lastSeen,
        isGhost,
    };
}
