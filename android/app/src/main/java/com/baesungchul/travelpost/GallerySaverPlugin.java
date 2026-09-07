package com.baesungchul.travelpost;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.OutputStream;

/**
 * GallerySaver — base64 이미지를 안드로이드 갤러리(Pictures/<album>)에 저장.
 *
 *  · API 29(Android 10)+ : MediaStore로 저장 → 권한 불필요, 재설치해도 EACCES 없음,
 *    저장 즉시 갤러리에 노출됨. 앱을 지워도 사진은 남음.
 *  · API 24~28(Android 7~9) : WRITE_EXTERNAL_STORAGE 런타임 권한 1회 필요.
 *
 *  ★ 2026-09-08 현장매니저에서 그대로 옮겨 왔다(패키지·앨범 이름만 교체).
 *    왜 필요한가: 모바일에서 블로그에 올릴 때 공유 시트로 사진을 넘기면 글쓰기 화면
 *    맨 위에 다 몰려서, 사용자가 하나씩 끌어 내려야 했다. 갤러리에 저장해 두면
 *    글의 사진 표시 자리에서 [사진] 으로 꺼내 넣을 수 있다.
 *
 *  자동 백업(auto_backup.js, 문서 폴더)과는 별개의 "내보내기" 경로다 — 충돌하지 않는다.
 */
@CapacitorPlugin(
    name = "GallerySaver",
    permissions = {
        @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage")
    }
)
public class GallerySaverPlugin extends Plugin {

    @PluginMethod
    public void saveImage(PluginCall call) {
        // Android 9 이하에서만 저장 권한이 필요
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermCallback");
            return;
        }
        doSave(call);
    }

    @PermissionCallback
    private void storagePermCallback(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                && getPermissionState("storage") != PermissionState.GRANTED) {
            call.reject("저장 권한이 거부되었습니다");
            return;
        }
        doSave(call);
    }

    private void doSave(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("data(base64)가 없습니다");
            return;
        }
        String filename = call.getString("filename", "img_" + System.currentTimeMillis() + ".jpg");
        String album = call.getString("album", "찍고쓰다");
        String mime = call.getString("mime", "image/jpeg");

        Uri item = null;
        ContentResolver resolver = getContext().getContentResolver();
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);

            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
            values.put(MediaStore.Images.Media.MIME_TYPE, mime);

            Uri collection;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.Images.Media.RELATIVE_PATH,
                        Environment.DIRECTORY_PICTURES + "/" + album);
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
                collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            } else {
                collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            }

            item = resolver.insert(collection, values);
            if (item == null) {
                call.reject("MediaStore에 항목을 만들지 못했습니다");
                return;
            }

            OutputStream os = resolver.openOutputStream(item);
            if (os == null) {
                call.reject("출력 스트림을 열지 못했습니다");
                return;
            }
            os.write(bytes);
            os.flush();
            os.close();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.clear();
                values.put(MediaStore.Images.Media.IS_PENDING, 0);
                resolver.update(item, values, null, null);
            }

            JSObject ret = new JSObject();
            ret.put("uri", item.toString());
            ret.put("filename", filename);
            call.resolve(ret);
        } catch (Exception e) {
            // 실패 시 미완성 항목 정리
            if (item != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try { resolver.delete(item, null, null); } catch (Exception ignored) {}
            }
            call.reject("갤러리 저장 실패: " + e.getMessage(), e);
        }
    }
}
