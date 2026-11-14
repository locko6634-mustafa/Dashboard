// ==========================================
// API DATA NORMALIZERS (Shared)
// ==========================================

/**
 * API yanıtlarındaki { data }, tekil obje veya { json } sarmalayıcılarını düz diziye çevirir.
 */
export function unwrapApiData(data) {
    if (data === null || data === undefined) return [];

    let items = data;
    if (!Array.isArray(items) && typeof items === 'object') {
        items = items.data ?? items.appointments ?? items.notes ?? [items];
    }
    if (!Array.isArray(items)) {
        items = [items];
    }

    return items
        .map((item) => (item && typeof item === 'object' && item.json ? item.json : item))
        .filter((item) => item !== null && item !== undefined);
}

/**
 * Randevu nesnelerindeki id/randevu_id ve saat/baslangic_saati alanlarını normalize eder.
 */
export function normalizeAppointment(apt) {
    if (!apt || typeof apt !== 'object') return null;

    const id = apt.randevu_id || apt.id || '';
    const rawTime = apt.saat || apt.baslangic_saati || '';
    const saat = typeof rawTime === 'string' ? rawTime.substring(0, 5) : '';
    const bitis_saati = typeof apt.bitis_saati === 'string'
        ? apt.bitis_saati.substring(0, 5)
        : (apt.bitis_saati || '');

    return {
        ...apt,
        id: apt.id || id,
        randevu_id: id,
        saat,
        baslangic_saati: apt.baslangic_saati || saat,
        bitis_saati,
    };
}

/**
 * Müşteri notu nesnelerindeki id ve not_metni/not alanlarını normalize eder.
 */
export function normalizeNote(note) {
    if (!note || typeof note !== 'object') return null;

    const metin = note.not_metni ?? note.not ?? '';
    const rawId = note.id ?? note.note_id ?? '';
    const id = rawId !== '' ? String(rawId) : '';

    return {
        ...note,
        id,
        not_metni: metin,
        not: note.not ?? metin,
        tarih: note.tarih || '',
    };
}
