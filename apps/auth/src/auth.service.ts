import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserDocument } from './users/models/users.schema';
import { TokenPayload } from './interfaces/token-payload.interface';
import { UsersService } from './users/users.service';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';
import mongoose from 'mongoose';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    @InjectRedis() private readonly redis: Redis,
  ) {}
  async login(user: UserDocument) {
    console.log('user=', user);
    const tokenPayload: TokenPayload = {
      userId: user._id.toHexString(),
      email: user.email,
    };

    const expires = new Date();
    expires.setSeconds(
      expires.getSeconds() + this.configService.get('JWT_EXPIRATION'),
    );

    const expiresRefresh = new Date();
    expiresRefresh.setSeconds(
      expires.getSeconds() + this.configService.get('JWT_REFRESH_EXPIRATION'),
    );

    const accessToken = await this.jwtService.signAsync(tokenPayload);

    const refreshToken = await this.jwtService.signAsync(tokenPayload, {
      expiresIn: `${this.configService.get('JWT_REFRESH_EXPIRATION')}s`,
      secret: this.configService.get('JWT_REFRESH_SECRET'),
    });

    console.log('refreshToken=', refreshToken);

    await this.redis.set(user.email, refreshToken, 'EX', 10000);

    return { accessToken, refreshToken };
  }

  async refreshToken(refreshToken: string) {
    const decodedUser = this.jwtService.decode<TokenPayload>(refreshToken);

    if (!decodedUser) {
      throw new ForbiddenException('Incorrect token');
    }

    const oldRefreshToken: string | null = await this.redis.get(
      decodedUser.email,
    );

    if (oldRefreshToken !== refreshToken) {
      throw new UnauthorizedException(
        'Authentication credentials were missing or incorrect',
      );
    }

    return await this.login({
      _id: new mongoose.Types.ObjectId(decodedUser.userId),
      email: decodedUser.email,
      password: '',
    });
  }
}
