const EDITOR_SIDEBAR_STORAGE_KEY = "edico-editor-sidebar-expanded";

export function readSidebarExpanded(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(EDITOR_SIDEBAR_STORAGE_KEY) !== "collapsed";
}

export { EDITOR_SIDEBAR_STORAGE_KEY };
