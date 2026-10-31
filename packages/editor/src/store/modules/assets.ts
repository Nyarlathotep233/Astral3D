import {reactive, toRefs,markRaw} from "vue";
import {defineStore} from 'pinia';
import {ChoroplethMap, Hdr, ImageReference, LocationHeart, ModelAlt, Opacity} from '@vicons/carbon';
import {store} from '@/store';
import {cpt} from "@/language";
import {fetchAssetsCategoryTreeList} from "@/http/api/assetsCategory";
import {markLeafNodes} from "@/utils/common/utils";

interface IAssetsState {
    // 资产分类树
    categories: IAssets.MainCategory[],
}

/**
 * 资产管理
 */
export const useAssetsStore = defineStore('assets-manager', () => {
    const state = reactive<IAssetsState>({
        categories: [
            { key: 'Model', label: cpt("home.assets.Model"), icon: markRaw(ModelAlt), children:[] },
            { key: 'Material', label: cpt("home.assets.Material"), icon: markRaw(Opacity), children:[] },
            { key: 'Texture', label: cpt("home.assets.Texture"), icon: markRaw(ImageReference), children:[] },
            { key: 'Billboard', label: cpt("home.assets.Billboard"), icon: markRaw(LocationHeart), children:[] },
            { key: 'HDR', label: 'HDR', icon: markRaw(Hdr), children:[] },
            { key: 'Tiles', label: '3D Tiles', icon: markRaw(ChoroplethMap), children:[] },
        ],
    })

    /**
     * getter
     **/


    /**
     * actions
     **/
    // 获取顶层分类子级
    const getCategoryChildren = (category: string) => {
        const c = state.categories.find(c => c.key === category);
        if(!c) return [] as IAssets.Category[];

        //@ts-ignore
        markLeafNodes(category.children);

        return c.children as IAssets.Category[];
    }

    // 获取资产分类树
    const fetchCategory = async () => {
        const res = await fetchAssetsCategoryTreeList();
        if(res.error){
            window.$message?.error(res.error.msg);
            return;
        }

        state.categories.forEach(c => {
            c.children = [];
        })

        res.data.forEach((item:IAssets.Category) => {
            const category = state.categories.find(c => c.key === item.type);
            if(!category) return;

            (category.children as IAssets.Category[]).push(item);
        })
    }


    return {
        ...toRefs(state),
        getCategoryChildren,
        fetchCategory
    }
});

// setup 之外使用
export function useAssetsStoreWithOut() {
    return useAssetsStore(store);
}