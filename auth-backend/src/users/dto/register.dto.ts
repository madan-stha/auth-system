import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NormalizeEmail, TrimOrUndefined } from '../../common/transforms';

export class RegisterDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(8)
  // bcrypt only uses the first 72 bytes of a password
  @MaxLength(72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'password must contain at least one lowercase letter, one uppercase letter and one number',
  })
  password: string;

  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
