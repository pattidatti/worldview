export interface Ship {
    mmsi: number;
    name: string;
    callSign: string;
    imo: number;
    lat: number;
    lon: number;
    speed: number;       // knots (SOG)
    course: number;      // degrees (COG)
    heading: number;     // degrees (true heading)
    rateOfTurn: number;  // degrees/min
    navStatus: number;   // 0-15 navigational status
    shipType: number;    // IMO type code 0-99
    length: number;      // meters
    width: number;       // meters
    draught: number;     // meters
    destination: string;
    lastSeen: number;    // Unix timestamp (ms) for siste AIS-oppdatering
}
