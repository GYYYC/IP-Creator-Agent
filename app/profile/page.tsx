import { PageIntro } from "@/components/page-intro";
import { ProfileStudio } from "@/components/profile-studio";

export default function ProfilePage() {
  return (
    <main>
      <div className="container">
        <PageIntro
          label="个人画像"
          title="这里会越来越像你"
          description="你可以继续补定位，也可以上传历史作品，把稳定风格和常见问题写回画像里。"
        />

        <ProfileStudio />
      </div>
    </main>
  );
}
