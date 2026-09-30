"""Render an original, silent product concept film for the pricing card."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
import pathlib, math, subprocess, imageio_ffmpeg
root=pathlib.Path.cwd(); dest=root/'public'/'videos'; dest.mkdir(exist_ok=True)
W,H=1080,680
FPS=60
photo=Image.open(root/'public'/'images'/'stories'/'456.png').convert('L').convert('RGB')
fonts=pathlib.Path('C:/Windows/Fonts')
def font(n,size): return ImageFont.truetype(str(fonts/n),size)
sans=font('segoeui.ttf',20); small=font('segoeui.ttf',15); serif=font('georgia.ttf',45); bold=font('segoeuib.ttf',20)
ff=imageio_ffmpeg.get_ffmpeg_exe()
pipe=subprocess.Popen([ff,'-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(dest/'idea-to-store-light.mp4')],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
dark_pipe=subprocess.Popen([ff,'-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(dest/'idea-to-store-dark.mp4')],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for i in range(8*FPS):
    t=i/FPS; wave=(1-math.cos(t*math.pi/4))/2
    im=Image.new('RGB',(W,H),'#f6f6f6'); d=ImageDraw.Draw(im)
    # A browser window with an actual visual product layout, gently moving as one scene.
    y=36; x=60
    d.rounded_rectangle((x+4,y+14,1024,y+558),24,fill='#e3e3e3')
    d.rounded_rectangle((x,y,1020,y+540),24,fill='white',outline='#d9d9d9',width=2)
    d.line((x,y+44,1020,y+44),fill='#e9e9e9',width=2)
    for a in range(3): d.ellipse((x+22+a*16,y+18,x+30+a*16,y+26),fill='#b4b4b4')
    d.rounded_rectangle((380,y+12,720,y+33),8,fill='#f3f3f3')
    d.text((480,y+12),'your-next-idea.site',font=small,fill='#777777')
    d.text((95,y+69),'RUNLY STUDIO',font=bold,fill='#191919')
    d.text((804,y+70),'Work    About    Contact',font=small,fill='#777777')
    d.line((95,y+108,985,y+108),fill='#eeeeee',width=2)
    d.text((98,y+146),'Your next idea.',font=serif,fill='#191919')
    d.text((98,y+204),'Made real.',font=serif,fill='#191919')
    d.text((100,y+277),'A place for the work you want to share.',font=sans,fill='#777777')
    d.rounded_rectangle((100,y+327,284,y+370),22,fill='#202020')
    d.text((121,y+336),'Explore the project',font=small,fill='white')
    # Cinematic, gently changing crop of the supplied cat/workspace photograph.
    zoom=1+.035*wave
    crop_w=min(photo.width,photo.height*450/310)/zoom; crop_h=crop_w*310/450
    cx=photo.width/2; cy=photo.height/2
    shot=photo.transform((450,310),Image.Transform.AFFINE,
        (crop_w/450,0,cx-crop_w/2,0,crop_h/310,cy-crop_h/2),
        Image.Resampling.BICUBIC)
    shot_mask=Image.new('L',(450,310)); ImageDraw.Draw(shot_mask).rounded_rectangle((0,0,450,310),18,fill=255)
    im.paste(shot,(530,y+142),shot_mask)
    d.text((100,y+476),'AN IDEA     /     A FIRST DRAFT     /     A NEW POSSIBILITY',font=small,fill='#888888')
    dark_im=ImageOps.invert(im); dark_im.paste(shot,(530,y+142),shot_mask)
    # Fractional translation avoids the one-pixel jumps of rounded positions.
    drift=8*math.sin(t*math.pi/4)
    im=im.transform((W,H),Image.Transform.AFFINE,(1,0,0,0,1,drift),Image.Resampling.BICUBIC,fillcolor='#f6f6f6')
    dark_im=dark_im.transform((W,H),Image.Transform.AFFINE,(1,0,0,0,1,drift),Image.Resampling.BICUBIC,fillcolor='#090909')
    d=ImageDraw.Draw(im)
    # The prompt becomes a finished storefront; all content is baked into video.
    d.rounded_rectangle((224,603,856,658),27,fill='#181818')
    d.ellipse((246,621,264,639),fill='#eeeeee')
    blend=max(0,min(1,(wave-.35)/.3)); blend=blend*blend*(3-2*blend)
    first=Image.new('RGBA',(W,H)); second=Image.new('RGBA',(W,H))
    ImageDraw.Draw(first).text((281,616),'An idea becomes a place to start.',font=sans,fill='white')
    ImageDraw.Draw(second).text((281,616),'Your website, taking shape.',font=sans,fill='white')
    captions=Image.blend(first,second,blend)
    d.rounded_rectangle((725,626,821,632),3,fill='#555555')
    d.rounded_rectangle((725,626,725+int(96*wave)+1,632),3,fill='white')
    # Share a steady caption bar between themes instead of flashing on a cut.
    bar_mask=Image.new('L',(633,56))
    ImageDraw.Draw(bar_mask).rounded_rectangle((0,0,632,55),27,fill=255)
    dark_im.paste(im.crop((224,603,857,659)),(224,603),bar_mask)
    im.paste(captions,(0,0),captions)
    dark_im.paste(captions,(0,0),captions)
    if i==0:
        im.save(dest/'idea-to-store-poster.jpg')
        dark_im.save(dest/'idea-to-store-dark-poster.jpg')
    pipe.stdin.write(im.tobytes())
    dark_pipe.stdin.write(dark_im.tobytes())
pipe.stdin.close(); dark_pipe.stdin.close()
if pipe.wait()!=0 or dark_pipe.wait()!=0: raise RuntimeError('Video encoding failed')
print('Rendered 1080 x 680, 60 fps, seamless 8-second product films')



