import { IsString, IsNotEmpty, MinLength } from 'class-validator';

/**
 * DTO для входа через VK ID (OAuth 2.0 + PKCE).
 * Клиент передаёт параметры, полученные после редиректа с id.vk.ru.
 * @see https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-description
 */
export class VkIdLoginDto {
  /** Код подтверждения authorization_code из redirect_uri */
  @IsString()
  @IsNotEmpty()
  code: string;

  /** PKCE: code_verifier (43–128 символов), использованный при запросе к /authorize */
  @IsString()
  @IsNotEmpty()
  @MinLength(43, { message: 'code_verifier must be at least 43 characters' })
  code_verifier: string;

  /** Идентификатор устройства, возвращённый в redirect_uri */
  @IsString()
  @IsNotEmpty()
  device_id: string;

  /** Строка состояния (не менее 32 символов). Должна совпадать с переданной при запросе авторизации */
  @IsString()
  @IsNotEmpty()
  @MinLength(32, { message: 'state must be at least 32 characters' })
  state: string;
}
