export interface AuthDataType {
  _id: string;
  name: string;
  email: string;
  image: string;
  googleAccessToken: string;
  googleRefreshToken: string;
  googleId: string;
  createdAt: string; 
  updatedAt: string; 
  __v: number;
  token: {
    accessToken: string;
    refreshToken: string;
  };
}
