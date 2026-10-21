export interface SessionCredentials {
  generation: number;
  accessToken: string;
}
export interface SessionPort {
  credentials(): SessionCredentials | null;
  refresh(failed: SessionCredentials): Promise<SessionCredentials | null>;
}
