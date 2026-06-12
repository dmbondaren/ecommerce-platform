export interface IUser {
    email: string;
    nickname?: string;
    isActivated: boolean;
    id: string;
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
    avatarUrl?: string;
}
