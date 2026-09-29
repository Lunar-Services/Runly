import cv2, numpy as np, pathlib, subprocess, sys, shutil
from PIL import Image
import imageio_ffmpeg
root=pathlib.Path.cwd()
ff=imageio_ffmpeg.get_ffmpeg_exe()
for stem in ['hero-loop','curious-loop']:
    src=root/'public'/'cats'/f'{stem}.mp4'
    out=root/'public'/'cats'/f'{stem}-alpha.webm'
    poster=root/'public'/'cats'/f'{stem}-alpha.png'
    frames=root/'.alpha-frames'/stem
    if frames.exists(): shutil.rmtree(frames)
    frames.mkdir(parents=True)
    cap=cv2.VideoCapture(str(src)); fps=cap.get(cv2.CAP_PROP_FPS) or 24
    index=0
    while True:
        ok,bgr=cap.read()
        if not ok: break
        h,w=bgr.shape[:2]
        gray=cv2.cvtColor(bgr,cv2.COLOR_BGR2GRAY)
        # The black fur forms the silhouette; white eyes are enclosed holes.
        raw=(gray < 115).astype(np.uint8)
        n,labels,stats,_=cv2.connectedComponentsWithStats(raw,8)
        main=1+np.argmax(stats[1:,cv2.CC_STAT_AREA])
        mask=(labels==main).astype(np.uint8)*255
        padded=cv2.copyMakeBorder(mask,1,1,1,1,cv2.BORDER_CONSTANT,value=0)
        flood=padded.copy()
        cv2.floodFill(flood,np.zeros((h+4,w+4),np.uint8),(0,0),255)
        mask=cv2.bitwise_or(padded,cv2.bitwise_not(flood))[1:-1,1:-1]
        # A tight, subpixel edge excludes studio white without cutting out eyes.
        alpha=cv2.GaussianBlur(mask,(3,3),0.5)
        interior=cv2.erode(mask,np.ones((7,7),np.uint8))>0
        edge=(alpha>0)&(~interior)
        clean=bgr.copy()
        clean[edge]=np.minimum(clean[edge],38)
        clean[alpha==0]=0
        rgba=cv2.cvtColor(clean,cv2.COLOR_BGR2RGBA)
        rgba[:,:,3]=alpha
        path=frames/f'{index:05d}.png'
        Image.fromarray(rgba).save(path,compress_level=2)
        if index==0: Image.fromarray(rgba).save(poster,compress_level=7)
        index+=1
    cap.release()
    subprocess.run([ff,'-y','-framerate',str(fps),'-i',str(frames/'%05d.png'),'-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-auto-alt-ref','0','-b:v','0','-crf','28',str(out)],check=True)
    shutil.rmtree(frames)
    print(stem,index,fps,out.stat().st_size)
shutil.rmtree(root/'.alpha-frames',ignore_errors=True)
