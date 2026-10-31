// Pilot dossier view (owner: WS-P). Stub from WS-R.

/** Fields WS-P defines (profile, best medals, flight log...). Empty in the stub. */
export type PilotDossierData = Record<string, unknown>;

/** Stub: null model. */
export function pilotDossierModel(_data: PilotDossierData): null {
  void _data;
  return null;
}

/** Stub: an empty div. */
export function buildPilotDossier(_model: unknown, _cb: unknown): HTMLElement {
  void _model;
  void _cb;
  return document.createElement("div");
}
