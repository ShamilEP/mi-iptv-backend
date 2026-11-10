export type HealthStatus = {
  readonly status: 'ok';
};

export class GetHealthStatus {
  execute(): HealthStatus {
    return { status: 'ok' };
  }
}
