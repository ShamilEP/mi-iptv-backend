import type {
  PushNotificationPayload,
  PushNotifier,
  PushSendResult,
} from '../../application/ports/push-notifier.js';

export type RecordedPushNotification = {
  readonly deviceId: string;
  readonly platform: string;
  readonly channel: 'fcm' | 'apns';
  readonly status: string;
  readonly title: string;
  readonly body: string;
  readonly data: Readonly<Record<string, string>>;
  /** Length only — never store the raw token in the recorder. */
  readonly pushTokenLength: number;
};

/**
 * Sprint 0 recorder that selects FCM vs APNs channel by platform.
 * Live HTTP/SDK adapters (INF-034 secrets) replace this after package approval.
 */
export class InMemoryPushNotifier implements PushNotifier {
  readonly sent: RecordedPushNotification[] = [];

  async send(
    notification: PushNotificationPayload,
  ): Promise<PushSendResult> {
    const channel = channelForPlatform(notification.platform);
    this.sent.push({
      deviceId: notification.deviceId,
      platform: notification.platform,
      channel,
      status: notification.status,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      pushTokenLength: notification.pushToken.length,
    });
    return { accepted: true, channel };
  }
}

function channelForPlatform(
  platform: PushNotificationPayload['platform'],
): 'fcm' | 'apns' {
  if (platform === 'ios') {
    return 'apns';
  }
  // android + android_tv use FCM when a token is present
  return 'fcm';
}
