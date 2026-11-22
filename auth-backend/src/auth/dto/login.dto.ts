import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NormalizeEmail } from '../../common/transforms';

export class LoginDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;

  // No strength rules on login: only check it's present, so the error
  // never hints at what a valid password looks like.
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password: string;
}
