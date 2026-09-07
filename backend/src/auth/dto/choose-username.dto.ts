import { IsString, Matches } from 'class-validator';

export class ChooseUsernameDto {
  /**
   * Printable ASCII, 3–16 characters — the rule the port has always used, kept
   * verbatim so existing accounts stay valid. Canon's UIDSIZ is 30, but that
   * bounds the login id (here an opaque usr_ key), not the display handle.
   */
  @Matches(/^[\x21-\x7E]{3,16}$/)
  @IsString()
  username!: string;
}
