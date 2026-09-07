package com.baesungchul.travelpost;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        /* ☠️ 2026-09-08 갤러리 저장 플러그인 등록 — 여기서 빠지면 JS 쪽
             Capacitor.Plugins.GallerySaver 가 undefined 가 되고, 오류 없이
             "갤러리 저장을 쓸 수 없습니다" 만 뜬다. 재빌드가 필요한 변경이다. */
        registerPlugin(GallerySaverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
