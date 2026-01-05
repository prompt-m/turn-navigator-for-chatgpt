export {};

declare global {
  interface Window {
    CGTN_LOGIC: any;
    CGTN_SHARED: any;
    CGTN_UI: any;
    CGTN_EVENTS: any;
    CGTN_I18N: any;
    CGTN_PREVIEW?: any;

    __CGTN_URL_HOOKED__?: boolean;
    __CGTN_MSG_BOUND__?: boolean;
  }
  interface Document {
    _cgtnPreviewDockBound?: boolean;
  }
  interface HTMLElement {
    _cgtnFocusGuard?: boolean;
  }
}

// window無しで参照してる名前も救済（既存コード互換）
declare const CGTN_LOGIC: any;
declare const CGTN_SHARED: any;
declare const CGTN_UI: any;
declare const CGTN_EVENTS: any;
declare const CGTN_I18N: any;
