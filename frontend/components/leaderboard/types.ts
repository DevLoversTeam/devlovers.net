export interface User {
  id: number;
  rank: number;
  username: string;
  points: number;
  avatar: string;
  change: number;
}

export interface CurrentUser {
  id: string;
  username: string;
  email: string;
}