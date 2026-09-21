// ==========================================
// UNDO MANAGER (Dashboard)
// ==========================================

import { Store } from './store.js';
import { showUndoToast } from '../shared/toast.js';

export class UndoManager {
    static registerAction = (type, data, performUndo, performCommit) => {
        // If there's an existing undo action, commit it immediately
        UndoManager.commitCurrent();

        const timer = setTimeout(() => {
            performCommit();
            if (Store.state.activeUndo && Store.state.activeUndo.timer === timer) {
                Store.state.activeUndo = null;
            }
        }, 5000);

        let toastMsg = '';
        if (type === 'delete') {
            toastMsg = 'Randevu silindi.';
        } else if (type === 'move') {
            toastMsg = 'Randevu taşındı.';
        } else if (type === 'resize') {
            toastMsg = 'Randevu süresi değiştirildi.';
        }

        const toastObj = showUndoToast(toastMsg, () => {
            clearTimeout(timer);
            performUndo();
            Store.state.activeUndo = null;
        });

        Store.state.activeUndo = {
            type,
            data,
            timer,
            toastObj,
            commit: () => {
                clearTimeout(timer);
                performCommit();
            }
        };
    };

    static commitCurrent = () => {
        if (Store.state.activeUndo) {
            try {
                Store.state.activeUndo.commit();
            } catch (e) {
                console.error('Error committing undo action:', e);
            }
            if (Store.state.activeUndo.toastObj) {
                Store.state.activeUndo.toastObj.cancel();
            }
            Store.state.activeUndo = null;
        }
    };
}

export default UndoManager;
