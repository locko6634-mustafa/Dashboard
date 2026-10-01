// ==========================================
// STORE & STATE MANAGEMENT (Dashboard)
// ==========================================

import { DateUtils } from '../shared/utils.js';

const initialApps = (typeof window !== 'undefined' && window.appData) ? window.appData : {};
Object.keys(initialApps).forEach(key => {
    const app = initialApps[key];
    if (app.deleted_at) {
        delete initialApps[key];
        return;
    }
    if (app.saat && app.saat.length > 5) app.saat = app.saat.substring(0, 5);
});

export class Store {
    static state = {
        appointments: initialApps,
        isAuthenticated: true,
        activePatientId: null,
        activeAptId: null,
        searchCache: {},
        isNewPatientMode: true,
        selectedClientId: null,
        selectedClientPhone: null,
        isSilentUpdating: false,
        silentUpdateStart: 0,
        activeMainTab: 'calendar',
        overviewData: null,
        currentViewDate: (typeof window !== 'undefined' && window.location) 
            ? (new URLSearchParams(window.location.search).get('date') || DateUtils.getTodayLocalISO()) 
            : DateUtils.getTodayLocalISO(),
        lastSync: null,
        renderedWeekKey: null,
        isLoading: false,
        patientNotes: [],
        visibleNotesCount: 3,
        calendarViewMode: (typeof window !== 'undefined' && window.innerWidth <= 768) ? 'day' : 'week',
        isAgendaCollapsed: (typeof window !== 'undefined' && window.innerWidth <= 768),
        sidebarTab: 'overview',
        pendingDeletes: [],
        activeUndo: null,
        calendarFilter: { status: 'all', query: '' },
        patientsList: [],
        patientsFilter: { status: 'all', query: '' },
        isLoadingPatients: false,
        patientAppointments: [],
        reportData: [],
        reportFiltered: [],
        reportDateRange: { start: null, end: null },
    };
}

if (typeof window !== 'undefined') {
    window.Store = Store;
}

export default Store;
