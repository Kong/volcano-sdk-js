export interface RealtimeModule {
  VolcanoRealtime: typeof import('./realtime').VolcanoRealtime;
  RealtimeChannel: typeof import('./realtime').RealtimeChannel;
}
