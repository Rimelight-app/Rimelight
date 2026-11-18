package com.tonihk00.clearplay.icons;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

public final class SymfoniumIconPackService extends Service {
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        stopSelf(startId);
        return START_NOT_STICKY;
    }
}
