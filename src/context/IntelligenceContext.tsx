import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import { type CountryFeature, findCountryAt } from '@/utils/countryLookup';
import { fetchCountryIntelligence, type CountryIntelligence } from '@/services/countryIntelligence';

export type IntelligenceMode = 'country' | 'rankings' | 'statistics';

interface State {
    isOpen: boolean;
    mode: IntelligenceMode;
    selectedCountry: CountryFeature | null;
    countryData: CountryIntelligence | null;
    loading: boolean;
    error: string | null;
}

type Action =
    | { type: 'OPEN_RANKINGS' }
    | { type: 'OPEN_STATISTICS' }
    | { type: 'OPEN_SEARCH' }
    | { type: 'SET_COUNTRY'; country: CountryFeature }
    | { type: 'SET_DATA'; data: CountryIntelligence }
    | { type: 'SET_LOADING'; loading: boolean }
    | { type: 'SET_ERROR'; error: string }
    | { type: 'SET_MODE'; mode: IntelligenceMode }
    | { type: 'CLOSE' };

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'OPEN_RANKINGS':
            return { ...state, isOpen: true, mode: 'rankings', selectedCountry: null, countryData: null, loading: false, error: null };
        case 'OPEN_SEARCH':
            return { ...state, isOpen: true, mode: 'country', selectedCountry: null, countryData: null, loading: false, error: null };
        case 'OPEN_STATISTICS':
            return { ...state, isOpen: true, mode: 'statistics', selectedCountry: null, countryData: null, loading: false, error: null };
        case 'SET_COUNTRY':
            return { ...state, isOpen: true, mode: 'country', selectedCountry: action.country, countryData: null, loading: true, error: null };
        case 'SET_DATA':
            return { ...state, countryData: action.data, loading: false };
        case 'SET_LOADING':
            return { ...state, loading: action.loading };
        case 'SET_ERROR':
            return { ...state, error: action.error, loading: false };
        case 'SET_MODE':
            return { ...state, mode: action.mode };
        case 'CLOSE':
            return { ...state, isOpen: false };
        default:
            return state;
    }
}

const INITIAL: State = {
    isOpen: false,
    mode: 'country',
    selectedCountry: null,
    countryData: null,
    loading: false,
    error: null,
};

interface IntelligenceContextValue extends State {
    openAt: (lat: number, lon: number) => Promise<boolean>;
    openCountry: (country: CountryFeature) => void;
    openRankings: () => void;
    openSearch: () => void;
    openStatistics: () => void;
    setMode: (mode: IntelligenceMode) => void;
    close: () => void;
}

const IntelligenceContext = createContext<IntelligenceContextValue | null>(null);

export function IntelligenceProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(reducer, INITIAL);

    const loadCountry = useCallback(async (country: CountryFeature) => {
        dispatch({ type: 'SET_COUNTRY', country });
        try {
            const data = await fetchCountryIntelligence(country);
            dispatch({ type: 'SET_DATA', data });
        } catch (e) {
            dispatch({ type: 'SET_ERROR', error: String(e) });
        }
    }, []);

    const openAt = useCallback(async (lat: number, lon: number): Promise<boolean> => {
        const country = await findCountryAt(lat, lon);
        if (!country) return false;
        await loadCountry(country);
        return true;
    }, [loadCountry]);

    const openCountry = useCallback((country: CountryFeature) => {
        loadCountry(country);
    }, [loadCountry]);

    const openRankings = useCallback(() => dispatch({ type: 'OPEN_RANKINGS' }), []);
    const openSearch = useCallback(() => dispatch({ type: 'OPEN_SEARCH' }), []);
    const openStatistics = useCallback(() => dispatch({ type: 'OPEN_STATISTICS' }), []);
    const setMode = useCallback((mode: IntelligenceMode) => dispatch({ type: 'SET_MODE', mode }), []);
    const close = useCallback(() => dispatch({ type: 'CLOSE' }), []);

    return (
        <IntelligenceContext.Provider value={{ ...state, openAt, openCountry, openRankings, openSearch, openStatistics, setMode, close }}>
            {children}
        </IntelligenceContext.Provider>
    );
}

export function useIntelligence() {
    const ctx = useContext(IntelligenceContext);
    if (!ctx) throw new Error('useIntelligence must be used within IntelligenceProvider');
    return ctx;
}
