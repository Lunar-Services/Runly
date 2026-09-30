"""Create tightly cropped, decontaminated, silent cat loops from studio clips."""
import cv2, numpy as np, pathlib, subprocess, shutil
from PIL import Image
import imageio_ffmpeg
root=pathlib.Path.cwd()
for stem in ['hero-loop','curious-loop']:
    cap=cv2.VideoCapture(str(root/'public'/'cats'/f'{stem}.mp4'))
    fps=cap.get(cv2.CAP_PROP_FPS) or 24
    frames=[]; bounds=[]
    while True:
        ok,bgr=cap.read()
        if not ok: break
        gray=cv2.cvtColor(bgr,cv2.COLOR_BGR2GRAY)
        n,labels,stats,_=cv2.connectedComponentsWithStats((gray<145).astype(np.uint8),8)
        if n<2: raise RuntimeError('Missing silhouette')
        mask=(labels==1+np.argmax(stats[1:,cv2.CC_STAT_AREA])).astype(np.uint8)*255
        padded=cv2.copyMakeBorder(mask,1,1,1,1,cv2.BORDER_CONSTANT,value=0)
        flood=padded.copy(); cv2.floodFill(flood,None,(0,0),255)
        mask=cv2.bitwise_or(padded,cv2.bitwise_not(flood))[1:-1,1:-1]
        interior=cv2.erode(mask,np.ones((5,5),np.uint8))>0
        alpha=np.where(interior,1.,np.clip((145-gray.astype(float))/100,0,1))
        alpha[mask==0]=0
        mask_ys=np.where(mask>0)[0]
        alpha[(np.arange(gray.shape[0])[:,None]>mask_ys.max()-40)&(gray>80)]=0
        rgb=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB).astype(float)
        edge=(alpha>0)&(~interior)
        a=alpha[edge][:,None]
        rgb[edge]=np.clip((rgb[edge]-225*(1-a))/np.maximum(a,.01),0,255)
        rgb[alpha==0]=0
        frames.append(np.dstack([rgb.astype(np.uint8),(alpha*255).astype(np.uint8)]))
        ys,xs=np.where(alpha>.1); bounds.append((xs.min(),ys.min(),xs.max()+1,ys.max()+1))
    cap.release()
    x0,y0=np.min(np.array(bounds)[:,:2],axis=0); x1,y1=np.max(np.array(bounds)[:,2:],axis=0)
    x0,y0=max(0,x0-12),max(0,y0-12)
    x1,y1=min(frames[0].shape[1],x1+12),min(frames[0].shape[0],y1+2)
    folder=root/'.alpha-frames'/stem; folder.mkdir(parents=True,exist_ok=True)
    # Forward and reverse frames meet without a reset jump or duplicate endpoint.
    order=list(range(len(frames)))+list(range(len(frames)-2,0,-1))
    for i,j in enumerate(order):
        im=Image.fromarray(frames[j][y0:y1,x0:x1])
        im.save(folder/f'{i:05d}.png',compress_level=1)
        if i==0: im.save(root/'public'/'cats'/f'{stem}-alpha.png')
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-framerate',str(fps),'-i',str(folder/'%05d.png'),'-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-auto-alt-ref','0','-b:v','0','-crf','24','-row-mt','1',str(root/'public'/'cats'/f'{stem}-alpha.webm')],check=True)
    shutil.rmtree(folder)
    print(stem,'crop',x1-x0,y1-y0,'frames',len(order),flush=True)
