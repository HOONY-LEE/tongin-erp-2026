import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CAMPAIGN_CHANNELS, type CampaignChannel } from '@tongin/shared';

export class CreateCampaignDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsIn(CAMPAIGN_CHANNELS)
  channel?: CampaignChannel;

  @IsString()
  @MaxLength(1000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  targetGrade?: string; // 미지정 = 전화번호 보유 전체 고객
}
