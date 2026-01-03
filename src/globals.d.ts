export {};

declare global {
  interface Window {
    CGTN_LOGIC: any;
    CGTN_SHARED: any;
    CGTN_UI: any;
    CGTN_EVENTS: any;
    CGTN_I18N: any;
    CGTN_PREVIEW?: any;
  }

  // window無しで参照してる名前も救済（既存コード互換）
  const CGTN_LOGIC: any;
  const CGTN_SHARED: any;
  const CGTN_UI: any;
  const CGTN_EVENTS: any;
  const CGTN_I18N: any;
}
