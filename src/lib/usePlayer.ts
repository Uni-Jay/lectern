import { useSyncExternalStore } from "react";
import { getSnapshot, subscribe } from "./player";

export function usePlayer() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
