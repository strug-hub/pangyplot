// Simplify-scoped ViewState instance.
// Tracks segment→bubble ownership for link resolution within the simplify viewer,
// independent of the core viewer's global viewState singleton.

import { ViewState } from '../../../graph/data/view-state.js';

const simplifyViewState = new ViewState();

export default simplifyViewState;

export function resetSimplifyViewState() {
    simplifyViewState.clear();
}
