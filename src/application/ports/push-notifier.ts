import type { DevicePlatform } from '../../domain/devices/device.js';

export type PushNotificationPayload = {
  readonly deviceId: string;
  readonly platform: DevicePlatform;
  /** Opaque device token — never log. */
  readonly pushToken: string;
  /** Companion status kind, or `send_to_tv` wake (BE-080). */
  readonly status: string;
  readonly title: string;
  readonly body: string;
  readonly data: Readonly<Record<string, string>>;
};

export type PushSendResult = {
  readonly accepted: boolean;
  /** Transport label for audit (fcm | apns | noop). */
  readonly channel: 'fcm' | 'apns' | 'noop';
};

/**
 * Delivers a companion push. Live FCM/APNs adapters stay behind this port
 * (INF-034 secrets); Sprint 0 uses an in-memory recorder.
 */
export interface PushNotifier {
  send(notification: PushNotificationPayload): Promise<PushSendResult>;
}
