import $api from "../http";
import type { AxiosResponse } from "axios";
import { AuthResponse } from "../models/response/AuthResponse";

export default class AuthService {

    static async login(email: string, password: string): Promise<AxiosResponse<AuthResponse>> {
        return $api.post<AuthResponse>('/login', { email, password });
    }

    static async registration(email: string, password: string): Promise<AxiosResponse<AuthResponse>> {
        return $api.post<AuthResponse>('/registration', { email, password });
    }

    static async requestPasswordReset(email: string): Promise<AxiosResponse<{ ok: boolean }>> {
        return $api.post('/password-reset/request', { email });
    }

    static async logout(): Promise<void> {
        await $api.post('/logout');
    }
}
